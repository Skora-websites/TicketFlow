import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongo";
import { Ticket, Comment, User, Notification, Category } from "@/lib/db/models";
import { requireApiRole, getUser, canAccessTicket, canTransitionStatus } from "@/lib/authz";
import { publishTicketEvent } from "@/lib/events";
import { canSetPriority, toTransferRef } from "@/lib/transfer";
import { z } from "zod";
import mongoose from "mongoose";
import { notify } from "@/lib/notifications";
import { stripAttachmentData, stripCommentAttachmentData } from "@/lib/attachments";
import { deleteAttachment, isValidStoredFileId } from "@/lib/attachments-store";

const ticketUpdateSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().min(10).optional(),
  category: z.string().min(1).max(40).regex(/^[a-z0-9-]+$/, "Invalid category").optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  status: z.enum(["open", "in_progress", "on_hold", "resolved", "closed"]).optional(),
  assigneeId: z.string().nullable().optional(),
  departmentId: z.string().nullable().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid ticket ID" }, { status: 400 });
    }

    // Load lean first: canAccessTicket compares raw ObjectId strings, so the
    // transfer subdoc must NOT be populated yet (populated fields would turn
    // the id comparisons into object-vs-string mismatches and revoke the
    // receiving manager's access).
    const ticket = await Ticket.findById(id).lean();

    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    // Access check BEFORE populate: requester/assignee/department ids are
    // compared as plain strings on this shape.
    const canAccess = canAccessTicket(
      user.role,
      user.id,
      ticket.requesterId.toString(),
      ticket.assigneeId?.toString(),
      ticket.departmentId?.toString(),
      user.departmentId,
      ticket.transfer,
      user.ticketAccess
    );

    if (!canAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Populate AFTER the access check for the response body.
    const populated = await Ticket.findById(id)
      .populate("requesterId", "name email")
      .populate("assigneeId", "name email")
      .populate("departmentId", "name color")
      .populate("assignedBy", "name email")
      // Transfer sender must be populated so the client can evaluate the
      // priority lock (sender may edit; receiving side may not).
      .populate("transfer.fromId", "name email role")
      .populate("transfer.toUserId", "name email")
      .populate("transfer.toManagerId", "name email")
      .populate("transfer.toDepartmentId", "name color")
      .populate("transfer.approvedBy", "name")
      .populate("transfer.rejectedBy", "name")
      .lean();
    if (!populated) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const comments = await Comment.find({ ticketId: id })
      .populate("authorId", "name email role")
      .sort({ createdAt: 1 })
      .lean();

    // Chat roster: sender of record + owning/addressed manager + assigned
    // agent. Resolved server-side so the UI renders exactly the set the
    // participant rule admits (no client-side re-derivation to drift).
    const chatParticipants: { id: string; name: string; role: string; kind: string }[] = [];
    const pushParticipant = (
      p: unknown,
      kind: "sender" | "manager" | "agent"
    ) => {
      const u = p as { _id?: unknown; name?: string; role?: string } | null | undefined;
      if (!u?._id) return;
      const idStr = String(u._id);
      if (chatParticipants.some((x) => x.id === idStr)) return;
      chatParticipants.push({ id: idStr, name: u.name ?? "Unknown", role: u.role ?? "", kind });
    };
    // Populated subdoc fields are documents ({_id,name}); unwrap to raw ids
    // before id-based lookups (String({_id:...}) would be "[object Object]").
    const rawTransfer = populated.transfer
      ? Object.fromEntries(
          Object.entries(populated.transfer as unknown as Record<string, unknown>).map(([k, v]) => [
            k,
            v && typeof v === "object" && "_id" in (v as object) ? (v as { _id: unknown })._id : v,
          ])
        )
      : undefined;
    const tRef = toTransferRef(rawTransfer);
    pushParticipant(populated.requesterId, "sender");
    if (tRef?.fromId) {
      // On transferred tickets the dispatcher replaces the filer as sender.
      const dispatcher = await User.findById(String(tRef.fromId)).select("name role").lean();
      chatParticipants.length = 0; // filer is superseded on transfers
      pushParticipant(dispatcher, "sender");
    }
    const owningDeptId = populated.departmentId
      ? String((populated.departmentId as { _id?: unknown })._id ?? populated.departmentId)
      : undefined;
    const addressedManagerId = tRef && String(tRef.toDepartmentId ?? "") === owningDeptId
      ? String(tRef.toManagerId ?? "")
      : undefined;
    const mgrFilter: Record<string, unknown> = { role: "manager", active: true };
    if (addressedManagerId) mgrFilter._id = addressedManagerId;
    else if (owningDeptId) mgrFilter.departmentId = owningDeptId;
    if (Object.keys(mgrFilter).length > 2) {
      const mgr = await User.findOne(mgrFilter).select("name role").lean();
      pushParticipant(mgr, "manager");
    }
    pushParticipant(populated.assigneeId, "agent");

    // Strip binary payloads; metadata stays for download links.
    const sanitizedTicket = stripAttachmentData(populated);
    const sanitizedComments = (comments as unknown as Record<string, unknown>[]).map(stripCommentAttachmentData);

    return NextResponse.json({ ticket: sanitizedTicket, comments: sanitizedComments, chatParticipants });
  } catch (error) {
    console.error("GET /api/tickets/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch ticket" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiRole("client", "team", "manager", "super_admin");
    if (authResult instanceof NextResponse) return authResult;
    const user = authResult;
    await connectDB();
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid ticket ID" }, { status: 400 });
    }

    const ticket = await Ticket.findById(id).lean();
    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const canAccess = canAccessTicket(
      user.role,
      user.id,
      ticket.requesterId.toString(),
      ticket.assigneeId?.toString(),
      ticket.departmentId?.toString(),
      user.departmentId,
      ticket.transfer,
      user.ticketAccess
    );

    if (!canAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = ticketUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    // Project-wide status rule: only managers and the assigned agent may move
    // a ticket's status. Super admins and the filing agent are read-only here.
    if (parsed.data.status !== undefined) {
      const isAssignee = ticket.assigneeId?.toString() === user.id;
      if (!canTransitionStatus(user.role, ticket.status, parsed.data.status, false, isAssignee)) {
        return NextResponse.json(
          { error: "Only the assigned agent or a manager can change the status" },
          { status: 403 }
        );
      }
    }

    // Project-wide priority rule: the sender of record chooses priority — the
    // filer for regular tickets, the dispatching user for transferred ones.
    // Everyone else (managers, other agents, super admins) is read-only.
    if (parsed.data.priority !== undefined && !canSetPriority(user, ticket)) {
      return NextResponse.json(
        { error: "Only the sender of this ticket can change its priority" },
        { status: 403 }
      );
    }

    // Clients may only reopen their own resolved/closed ticket; block all other fields.
    if (user.role === "client") {
      const provided = Object.keys(parsed.data).filter(
        (k) => (parsed.data as Record<string, unknown>)[k] !== undefined
      );
      if (provided.some((k) => k !== "status")) {
        return NextResponse.json(
          { error: "Clients may only update ticket status" },
          { status: 403 }
        );
      }
    }

    // Dynamic categories: reject unknown slugs instead of silently saving.
    if (parsed.data.category !== undefined) {
      const categoryDoc = await Category.findOne({ slug: parsed.data.category }).lean();
      if (!categoryDoc) {
        return NextResponse.json({ error: `Unknown category "${parsed.data.category}"` }, { status: 400 });
      }
    }

    const { status, assigneeId, departmentId, ...rest } = parsed.data;
    const updateData: Record<string, unknown> = { ...rest };

    if (status) {
      // Gate already enforced above with the same rule; kept for the
      // transition-matrix check (valid moves from the current state).
      const isAssignee = ticket.assigneeId?.toString() === user.id;
      const canTransition = canTransitionStatus(user.role, ticket.status, status, false, isAssignee);
      if (!canTransition) {
        return NextResponse.json(
          { error: `Cannot transition from ${ticket.status} to ${status}` },
          { status: 400 }
        );
      }

      updateData.status = status;
      if (status === "resolved" || status === "closed") {
        updateData.closedAt = new Date();
      } else {
        updateData.closedAt = null;
      }
    }

    if (assigneeId !== undefined) {
      // Assignment is a MANAGER power. Super admins have exactly one
      // assignment tool: FORWARD an unassigned ticket to a manager — the
      // forward routes the ticket into that manager's department, and the
      // manager then assigns their own team. Super admins never assign agents
      // directly. Unassigning stays available to super admins as oversight.
      if (assigneeId && !mongoose.Types.ObjectId.isValid(assigneeId)) {
        return NextResponse.json({ error: "Invalid assignee ID" }, { status: 400 });
      }

      if (user.role === "super_admin") {
        if (assigneeId) {
          const target = await User.findById(assigneeId).select("role departmentId").lean();
          if (!target || target.role !== "manager") {
            return NextResponse.json(
              { error: "Super admins can only forward unassigned tickets to a manager" },
              { status: 403 }
            );
          }
          if (ticket.assigneeId) {
            return NextResponse.json(
              { error: "This ticket is already assigned — only a manager can reassign it" },
              { status: 403 }
            );
          }
          if (!target.departmentId) {
            return NextResponse.json(
              { error: "That manager has no department to receive the ticket" },
              { status: 400 }
            );
          }
          updateData.assigneeId = new mongoose.Types.ObjectId(assigneeId);
          updateData.assignedBy = new mongoose.Types.ObjectId(user.id);
          // The forward IS the routing: without this the ticket would keep
          // departmentId=null and NO manager could ever see it (access and
          // list scoping are department-based for managers).
          updateData.departmentId = new mongoose.Types.ObjectId(target.departmentId);
        } else {
          updateData.assigneeId = null;
          updateData.assignedBy = null;
        }
      } else if (user.role === "manager") {
        if (assigneeId) {
          updateData.assigneeId = new mongoose.Types.ObjectId(assigneeId);
          updateData.assignedBy = new mongoose.Types.ObjectId(user.id);

          const assignee = await User.findById(assigneeId).select("departmentId").lean();
          // Managers may only reassign within their own department; otherwise
          // they could move tickets (and their department) across the org.
          if (
            !assignee ||
            !user.departmentId ||
            assignee.departmentId?.toString() !== user.departmentId
          ) {
            return NextResponse.json(
              { error: "You can only assign tickets to members of your own department" },
              { status: 403 }
            );
          }
          if (assignee.departmentId) {
            updateData.departmentId = assignee.departmentId;
          }
        } else {
          updateData.assigneeId = null;
          updateData.assignedBy = null;
        }
      } else {
        return NextResponse.json({ error: "Only managers can reassign tickets" }, { status: 403 });
      }

      // Transferred tickets complete their journey on assignment: when the
      // receiving manager assigns an agent — or a super admin's forward lands
      // — the transfer is marked approved so the sender's "Sent" view
      // reflects reality.
      if (updateData.assigneeId && ticket.transfer && ticket.transfer.status === "pending") {
        updateData["transfer.status"] = "approved";
        updateData["transfer.approvedBy"] = new mongoose.Types.ObjectId(user.id);
        updateData["transfer.approvedAt"] = new Date();
      }
    }

    if (departmentId !== undefined && user.role === "super_admin") {
      if (departmentId) {
        if (!mongoose.Types.ObjectId.isValid(departmentId)) {
          return NextResponse.json({ error: "Invalid department ID" }, { status: 400 });
        }
        updateData.departmentId = new mongoose.Types.ObjectId(departmentId);
      } else {
        updateData.departmentId = null;
      }
    }

    updateData.updatedAt = new Date();

    const updatedTicket = await Ticket.findByIdAndUpdate(id, updateData, { returnDocument: "after" })
      .populate("requesterId", "name email")
      .populate("assigneeId", "name email")
      .populate("departmentId", "name color")
      .populate("assignedBy", "name email")
      .populate("transfer.fromId", "name email role")
      .populate("transfer.toUserId", "name email")
      .populate("transfer.toManagerId", "name email")
      .populate("transfer.toDepartmentId", "name color")
      .populate("transfer.approvedBy", "name")
      .populate("transfer.rejectedBy", "name")
      .lean();

    if (!updatedTicket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    // Notify participants on status change / reassignment.
    const ticketNumber = updatedTicket.ticketNumber;
    const ticketTitle = updatedTicket.title;

    if (status && status !== ticket.status) {
      const recipients: string[] = [];
      const requesterId = ticket.requesterId.toString();
      const currentAssigneeId = assigneeId !== undefined ? assigneeId : ticket.assigneeId?.toString();
      if (requesterId !== user.id) recipients.push(requesterId);
      if (currentAssigneeId && currentAssigneeId !== user.id) recipients.push(currentAssigneeId);
      if (recipients.length) {
        await notify(
          recipients.map((rid) => ({ id: rid })),
          {
            type: "status_changed",
            ticketId: id,
            ticketNumber,
            title: `Ticket ${ticketNumber} is now ${status.replace("_", " ")}`,
            body: ticketTitle,
          }
        );
      }
    }

    if (
      assigneeId &&
      typeof assigneeId === "string" &&
      assigneeId !== ticket.assigneeId?.toString() &&
      assigneeId !== user.id
    ) {
      await notify(
        [{ id: assigneeId }],
        {
          type: "ticket_assigned",
          ticketId: id,
          ticketNumber,
          title:
            user.role === "super_admin"
              ? `${ticketNumber} was forwarded to you`
              : `You were assigned ${ticketNumber}`,
          body: ticketTitle,
        }
      );
    }

    // System events: auto-append a visible timeline entry for status changes
    // and (re)assignments so the conversation shows who did what without
    // digging through notifications. Stored as kind:"system" comments; only
    // meaningful when something actually changed.
    const eventParts: string[] = [];
    if (status && status !== ticket.status) {
      eventParts.push(`changed status from ${ticket.status.replace("_", " ")} to ${status.replace("_", " ")}`);
    }
    if (assigneeId !== undefined) {
      const newAssignee = (updatedTicket.assigneeId as { _id?: unknown; name?: string } | null);
      const oldAssigneeId = ticket.assigneeId?.toString();
      if (!assigneeId && oldAssigneeId) {
        eventParts.push("unassigned this ticket");
      } else if (assigneeId && assigneeId !== oldAssigneeId) {
        const verb = user.role === "super_admin" ? "forwarded this ticket to" : "assigned this ticket to";
        eventParts.push(`${verb} ${newAssignee?.name ?? "a teammate"}`);
      }
    }
    if (eventParts.length) {
      await Comment.create({
        ticketId: new mongoose.Types.ObjectId(id),
        authorId: new mongoose.Types.ObjectId(user.id),
        body: `${user.name ?? "Someone"} ${eventParts.join(" and ")}`,
        kind: "system",
        visibility: "public",
      });
      publishTicketEvent(id, "comment");
    }

    // Status changes (close/freeze, reopen) are also chat-relevant even when
    // no system comment was written.
    if (status && status !== ticket.status) {
      publishTicketEvent(id, "ticket");
    }

    return NextResponse.json({ ticket: stripAttachmentData(updatedTicket) });
  } catch (error) {
    console.error("PATCH /api/tickets/[id] error:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to update ticket" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiRole("manager", "super_admin");
    if (authResult instanceof NextResponse) return authResult;
    const user = authResult;
    await connectDB();
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid ticket ID" }, { status: 400 });
    }

    const ticket = await Ticket.findById(id).lean();
    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    // Managers may only delete tickets within their own department. Both IDs
    // must be present and equal, so a dept-less manager can never delete.
    if (user.role === "manager") {
      if (!user.departmentId || ticket.departmentId?.toString() !== user.departmentId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Cascade-delete children so we don't leave orphaned records or dangling
    // references — comments on a deleted ticket AND notifications pointing at
    // a now-404 ticket. Attachment bytes live in GridFS (not inside these
    // docs) — collect their fileIds first and free them after the delete.
    const commentRows = await Comment.find({ ticketId: id }).select("attachment.fileId").lean();
    const storedFileIds = [
      ...((ticket.attachments ?? []) as { fileId?: string }[]).map((a) => a.fileId),
      ...commentRows.map((c) => (c.attachment as { fileId?: string } | undefined)?.fileId),
    ].filter((fid): fid is string => isValidStoredFileId(fid));
    await Comment.deleteMany({ ticketId: id });
    await Notification.deleteMany({ ticketId: id });
    await Ticket.findByIdAndDelete(id);
    for (const fid of storedFileIds) void deleteAttachment(fid);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/tickets/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete ticket" }, { status: 500 });
  }
}