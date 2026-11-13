import "server-only";

import mongoose from "mongoose";
import { connectDB } from "@/lib/db/mongo";
import { Ticket, Comment, User, Category } from "@/lib/db/models";
import { canAccessTicket, canTransitionStatus, type SessionUser } from "@/lib/authz";
import { canSetPriority } from "@/lib/transfer";
import { publishTicketEvent } from "@/lib/events";
import { notify } from "@/lib/notifications";

/**
 * THE ticket mutation pipeline. `PATCH /api/tickets/[id]` and
 * `POST /api/tickets/bulk` both call this, so a batch action can never take a
 * permission path the single-ticket route would reject — there is only one
 * implementation of the rules (access, status transitions, priority lock,
 * manager/super-admin assignment, client field allowlist) and one place that
 * records the side effects (notifications, timeline event, SSE ping).
 */

export type TicketPatchInput = {
  title?: string;
  description?: string;
  category?: string;
  priority?: "low" | "medium" | "high" | "urgent";
  status?: "open" | "in_progress" | "on_hold" | "resolved" | "closed";
  assigneeId?: string | null;
  departmentId?: string | null;
};

export type TicketFieldChanged = "status" | "priority" | "assigneeId";

export interface TicketPatchSuccess {
  ok: true;
  ticketNumber: string;
  ticket: Record<string, unknown>;
  /** Server-truth snapshot of the mutable fields, for undo. */
  previous: { status: string; priority: string; assigneeId: string | null };
  /** Fields that actually changed — undo sends only these back. */
  changed: TicketFieldChanged[];
}

export interface TicketPatchFailure {
  ok: false;
  status: number;
  error: string;
}

export type TicketPatchResult = TicketPatchSuccess | TicketPatchFailure;

const fail = (status: number, error: string): TicketPatchFailure => ({ ok: false, status, error });

// Chain populates must be {path, select} pairs: a flat array of strings would
// be read as a list of PATHS (mongoose then tries to populate "name").
const TICKET_POPULATE = [
  { path: "requesterId", select: "name email avatar" },
  { path: "assigneeId", select: "name email avatar" },
  { path: "departmentId", select: "name color" },
  { path: "assignedBy", select: "name email" },
  { path: "transfer.fromId", select: "name email role" },
  { path: "transfer.toUserId", select: "name email" },
  { path: "transfer.toManagerId", select: "name email" },
  { path: "transfer.toDepartmentId", select: "name color" },
  { path: "transfer.approvedBy", select: "name" },
  { path: "transfer.rejectedBy", select: "name" },
];

export async function applyTicketPatch(
  user: SessionUser,
  id: string,
  patch: TicketPatchInput
): Promise<TicketPatchResult> {
  await connectDB();

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return fail(400, "Invalid ticket ID");
  }

  const ticket = await Ticket.findById(id).lean();
  if (!ticket) {
    return fail(404, "Ticket not found");
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
    return fail(403, "Forbidden");
  }

  // Project-wide status rule: managers and the assigned agent may move a
  // ticket's status; clients may only reopen their own resolved/closed ticket.
  if (patch.status !== undefined) {
    const isAssignee = ticket.assigneeId?.toString() === user.id;
    const isOwner = ticket.requesterId.toString() === user.id;
    if (!canTransitionStatus(user.role, ticket.status, patch.status, isOwner, isAssignee)) {
      return fail(403, `Cannot transition status from ${ticket.status} to ${patch.status}`);
    }
  }

  // Project-wide priority rule: the sender of record chooses priority — the
  // filer for regular tickets, the dispatching user for transferred ones.
  if (patch.priority !== undefined && !canSetPriority(user, ticket)) {
    return fail(403, "Only the sender of this ticket can change its priority");
  }

  // Clients may only reopen their own resolved/closed ticket; block other fields.
  if (user.role === "client") {
    const provided = Object.keys(patch).filter(
      (k) => (patch as Record<string, unknown>)[k] !== undefined
    );
    if (provided.some((k) => k !== "status")) {
      return fail(403, "Clients may only update ticket status");
    }
  }

  // Dynamic categories: reject unknown slugs instead of silently saving.
  if (patch.category !== undefined) {
    const categoryDoc = await Category.findOne({ slug: patch.category }).lean();
    if (!categoryDoc) {
      return fail(400, `Unknown category "${patch.category}"`);
    }
  }

  const previous = {
    status: ticket.status as string,
    priority: ticket.priority as string,
    assigneeId: ticket.assigneeId ? ticket.assigneeId.toString() : null,
  };

  const { status, assigneeId, departmentId, ...rest } = patch;
  const updateData: Record<string, unknown> = { ...rest };

  if (status) {
    updateData.status = status;
    if (status === "resolved" || status === "closed") {
      updateData.closedAt = new Date();
    } else {
      updateData.closedAt = null;
    }
  }

  if (assigneeId !== undefined) {
    // Assignment is a MANAGER power. Super admins have exactly one assignment
    // tool: forward an UNASSIGNED ticket to a manager (which also moves the
    // ticket into that manager's department). Unassigning stays available to
    // super admins as oversight.
    if (assigneeId && !mongoose.Types.ObjectId.isValid(assigneeId)) {
      return fail(400, "Invalid assignee ID");
    }

    if (user.role === "super_admin") {
      if (assigneeId) {
        const target = await User.findById(assigneeId).select("role departmentId").lean();
        if (!target || target.role !== "manager") {
          return fail(403, "Super admins can only forward unassigned tickets to a manager");
        }
        if (ticket.assigneeId) {
          return fail(403, "This ticket is already assigned — only a manager can reassign it");
        }
        if (!target.departmentId) {
          return fail(400, "That manager has no department to receive the ticket");
        }
        updateData.assigneeId = new mongoose.Types.ObjectId(assigneeId);
        updateData.assignedBy = new mongoose.Types.ObjectId(user.id);
        // The forward IS the routing: without this the ticket would keep
        // departmentId=null and no manager could ever see it.
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
        // Managers may only reassign within their own department.
        if (
          !assignee ||
          !user.departmentId ||
          assignee.departmentId?.toString() !== user.departmentId
        ) {
          return fail(403, "You can only assign tickets to members of your own department");
        }
        if (assignee.departmentId) {
          updateData.departmentId = assignee.departmentId;
        }
      } else {
        updateData.assigneeId = null;
        updateData.assignedBy = null;
      }
    } else {
      return fail(403, "Only managers can reassign tickets");
    }

    // Transferred tickets complete their journey on assignment.
    if (updateData.assigneeId && ticket.transfer && ticket.transfer.status === "pending") {
      updateData["transfer.status"] = "approved";
      updateData["transfer.approvedBy"] = new mongoose.Types.ObjectId(user.id);
      updateData["transfer.approvedAt"] = new Date();
    }
  }

  if (departmentId !== undefined && user.role === "super_admin") {
    if (departmentId) {
      if (!mongoose.Types.ObjectId.isValid(departmentId)) {
        return fail(400, "Invalid department ID");
      }
      updateData.departmentId = new mongoose.Types.ObjectId(departmentId);
    } else {
      updateData.departmentId = null;
    }
  }

  updateData.updatedAt = new Date();

  const updatedTicket = await Ticket.findByIdAndUpdate(id, updateData, {
    returnDocument: "after",
  })
    .populate(TICKET_POPULATE)
    .lean();

  if (!updatedTicket) {
    return fail(404, "Ticket not found");
  }

  const ticketNumber = updatedTicket.ticketNumber;
  const ticketTitle = updatedTicket.title;
  const statusChanged = !!status && status !== ticket.status;

  if (statusChanged) {
    const recipients: string[] = [];
    const requesterId = ticket.requesterId.toString();
    const currentAssigneeId = assigneeId !== undefined ? assigneeId : ticket.assigneeId?.toString();
    if (requesterId !== user.id) recipients.push(requesterId);
    if (currentAssigneeId && currentAssigneeId !== user.id) recipients.push(currentAssigneeId);
    if (recipients.length) {
      await notify(recipients.map((rid) => ({ id: rid })), {
        type: "status_changed",
        ticketId: id,
        ticketNumber,
        title: `Ticket ${ticketNumber} is now ${status.replace("_", " ")}`,
        body: ticketTitle,
      });
    }
  }

  if (
    assigneeId &&
    typeof assigneeId === "string" &&
    assigneeId !== ticket.assigneeId?.toString() &&
    assigneeId !== user.id
  ) {
    await notify([{ id: assigneeId }], {
      type: "ticket_assigned",
      ticketId: id,
      ticketNumber,
      title:
        user.role === "super_admin"
          ? `${ticketNumber} was forwarded to you`
          : `You were assigned ${ticketNumber}`,
      body: ticketTitle,
    });
  }

  // System events: auto-append a visible timeline entry for status changes
  // and (re)assignments so the conversation shows who did what.
  const eventParts: string[] = [];
  if (statusChanged) {
    eventParts.push(
      `changed status from ${ticket.status.replace("_", " ")} to ${status.replace("_", " ")}`
    );
  }
  if (assigneeId !== undefined) {
    const newAssignee = updatedTicket.assigneeId as { _id?: unknown; name?: string } | null;
    const oldAssigneeId = ticket.assigneeId?.toString();
    if (!assigneeId && oldAssigneeId) {
      eventParts.push("unassigned this ticket");
    } else if (assigneeId && assigneeId !== oldAssigneeId) {
      const verb =
        user.role === "super_admin" ? "forwarded this ticket to" : "assigned this ticket to";
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

  // Status changes (close/freeze, reopen) are also chat-relevant even when no
  // system comment was written.
  if (statusChanged) {
    publishTicketEvent(id, "ticket");
  }

  const changed: TicketFieldChanged[] = [];
  if (statusChanged) changed.push("status");
  if (patch.priority !== undefined && patch.priority !== previous.priority) changed.push("priority");
  const nextAssigneeId = updatedTicket.assigneeId
    ? String((updatedTicket.assigneeId as { _id?: unknown })._id ?? updatedTicket.assigneeId)
    : null;
  if (assigneeId !== undefined && nextAssigneeId !== previous.assigneeId) {
    changed.push("assigneeId");
  }

  return {
    ok: true,
    ticketNumber,
    ticket: updatedTicket as unknown as Record<string, unknown>,
    previous,
    changed,
  };
}
