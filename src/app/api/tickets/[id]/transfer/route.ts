import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/mongo";
import { Ticket, User, Department, Category, Comment } from "@/lib/db/models";
import { requireApiRole, canAccessTicket } from "@/lib/authz";
import { canDecideTransfer } from "@/lib/transfer";
import { publishTicketEvent } from "@/lib/events";
import { notify } from "@/lib/notifications";
import { stripAttachmentData } from "@/lib/attachments";
import { z } from "zod";

export const dynamic = "force-dynamic";

const sendSchema = z.object({
  direction: z.enum(["agent", "manager"]),
  toDepartmentId: z.string().min(1),
  toUserId: z.string().nullable().optional(),
  toManagerId: z.string().nullable().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  note: z.string().max(1000).optional(),
});

const decideSchema = z.object({
  action: z.enum(["approve", "reject"]),
  /** Optional sender-facing explanation when rejecting. */
  reason: z.string().max(500).optional(),
});

const TRANSFER_POPULATE = [
  { path: "transfer.fromId", select: "name email role" },
  { path: "transfer.toUserId", select: "name email" },
  { path: "transfer.toManagerId", select: "name email" },
  { path: "transfer.toDepartmentId", select: "name color" },
  { path: "transfer.approvedBy", select: "name" },
  { path: "transfer.rejectedBy", select: "name" },
];

async function loadTicketForAccess(id: string, user: Awaited<ReturnType<typeof requireApiRole>>) {
  if (user instanceof NextResponse) return { error: user };
  await connectDB();
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { error: NextResponse.json({ error: "Invalid ticket ID" }, { status: 400 }) };
  }
  const ticket = await Ticket.findById(id)
    .populate("requesterId", "name email")
    .populate("assigneeId", "name email")
    .populate("departmentId", "name color")
    .populate(TRANSFER_POPULATE)
    .lean();
  if (!ticket) {
    return { error: NextResponse.json({ error: "Ticket not found" }, { status: 404 }) };
  }
  const access = canAccessTicket(
    user.role,
    user.id,
    (ticket.requesterId as { _id: mongoose.Types.ObjectId })._id.toString(),
    (ticket.assigneeId as { _id: mongoose.Types.ObjectId } | null)?._id?.toString(),
    (ticket.departmentId as { _id: mongoose.Types.ObjectId } | null)?._id?.toString(),
    user.departmentId,
      ticket.transfer,
      user.ticketAccess
  );
  if (!access) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user, ticket };
}

/** Transfer state for the ticket detail panel (poll-friendly). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireApiRole("team", "manager", "super_admin");
    if (authResult instanceof NextResponse) return authResult;
    const { id } = await params;
    const ctx = await loadTicketForAccess(id, authResult);
    if ("error" in ctx) return ctx.error;
    const { ticket } = ctx;
    return NextResponse.json({ transfer: ticket.transfer ?? null });
  } catch (error) {
    console.error("GET /api/tickets/[id]/transfer error:", error);
    return NextResponse.json({ error: "Failed to load transfer" }, { status: 500 });
  }
}

/**
 * Send this ticket to another department. Sender = the ticket's assignee or
 * the requester if staff (or a manager of the current department). Priority is
 * chosen here by the sender and becomes READ-ONLY for the receiving side.
 *
 * direction="agent": the ticket lands on the receiving manager's dashboard
 * first and only moves to the agent's dashboard after manager approval.
 * direction="manager": the receiving manager assigns an agent themselves.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireApiRole("team", "manager", "super_admin");
    if (authResult instanceof NextResponse) return authResult;
    const user = authResult;
    const { id } = await params;
    const ctx = await loadTicketForAccess(id, user);
    if ("error" in ctx) return ctx.error;
    const { ticket } = ctx;
    const ticketDoc = ticket as unknown as {
      _id: mongoose.Types.ObjectId;
      ticketNumber: string;
      title: string;
      category: string;
      transfer?: Record<string, unknown> | null;
    };

    if (ticketDoc.transfer) {
      return NextResponse.json(
        { error: `A transfer is already ${ticketDoc.transfer.status} for this ticket` },
        { status: 409 }
      );
    }

    const body = await request.json();
    const parsed = sendSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { direction, toDepartmentId, note } = parsed.data;
    const toUserId = parsed.data.toUserId || null;

    // Super admins dispatch to a department's MANAGER only — agent-directed
    // transfers are a staff (team/manager) action. The receiving manager then
    // assigns a team member as usual.
    if (user.role === "super_admin" && direction === "agent") {
      return NextResponse.json(
        { error: "Super admins can only transfer tickets to a department's manager" },
        { status: 403 }
      );
    }

    if (!mongoose.Types.ObjectId.isValid(toDepartmentId)) {
      return NextResponse.json({ error: "Invalid department ID" }, { status: 400 });
    }
    const targetDept = await Department.findById(toDepartmentId).lean();
    if (!targetDept) {
      return NextResponse.json({ error: "Target department not found" }, { status: 404 });
    }
    if (user.departmentId && targetDept._id.toString() === user.departmentId) {
      return NextResponse.json({ error: "Cannot transfer to your own department" }, { status: 400 });
    }

    // A ticket may only be sent to the department that owns its category:
    // "Billing" tickets go to the Billing department, whose manager then
    // approves/assigns. Categories without a linked department can go anywhere.
    const ticketCategory = await Category.findOne({ slug: ticketDoc.category })
      .select("departmentId")
      .lean();
    if (ticketCategory?.departmentId) {
      const owningDeptId = (ticketCategory.departmentId as mongoose.Types.ObjectId).toString();
      if (owningDeptId !== toDepartmentId) {
        return NextResponse.json(
          {
            error: `Tickets in the "${ticketDoc.category}" category can only be sent to their owning department`,
          },
          { status: 400 }
        );
      }
    }

    // Resolve the receiving manager of the target department.
    const targetManager = await User.findOne({
      departmentId: targetDept._id,
      role: "manager",
      active: true,
    })
      .select("_id name departmentId")
      .lean();
    if (!targetManager) {
      return NextResponse.json(
        { error: "The target department has no active manager to receive this ticket" },
        { status: 400 }
      );
    }

    let targetAgent: { _id: mongoose.Types.ObjectId; name: string } | null = null;
    if (direction === "agent") {
      if (!toUserId || !mongoose.Types.ObjectId.isValid(toUserId)) {
        return NextResponse.json({ error: "Select the agent to send this ticket to" }, { status: 400 });
      }
      targetAgent = await User.findOne({
        _id: toUserId,
        departmentId: targetDept._id,
        role: "team",
        active: true,
      })
        .select("_id name")
        .lean();
      if (!targetAgent) {
        return NextResponse.json(
          { error: "The selected agent is not an active member of the target department" },
          { status: 400 }
        );
      }
    }

    const sentAt = new Date();
    const updatedTicket = await Ticket.findByIdAndUpdate(
      id,
      {
        $set: {
          // The sender's chosen priority IS the ticket priority from here on —
          // it becomes read-only for the receiving side (enforced in PATCH).
          priority: parsed.data.priority,
          transfer: {
            fromId: new mongoose.Types.ObjectId(user.id),
            toDepartmentId: targetDept._id,
            toUserId: targetAgent ? targetAgent._id : null,
            toManagerId: new mongoose.Types.ObjectId(targetManager._id),
            direction,
            priority: parsed.data.priority,
            status: "pending",
            approvedBy: null,
            approvedAt: null,
            rejectedBy: null,
            rejectedAt: null,
            sentAt,
            readAt: null,
            note: note ?? "",
          },
        },
      },
      { returnDocument: "after" }
    )
      .populate(TRANSFER_POPULATE)
      .lean();

    // Notify the receiving manager (approver) and, for manager-directed
    // transfers, nothing else — the manager assigns an agent themselves.
    await notify(
      [{ id: targetManager._id.toString() }],
      {
        type: "transfer_sent",
        ticketId: id,
        ticketNumber: ticketDoc.ticketNumber,
        title: `Incoming transfer: ${ticketDoc.ticketNumber}`,
        body: ticketDoc.title,
      }
    );

    // System event in the conversation: who sent the ticket where.
    await Comment.create({
      ticketId: new mongoose.Types.ObjectId(id),
      authorId: new mongoose.Types.ObjectId(user.id),
      body: `${user.name ?? "Someone"} sent this ticket to the ${(targetDept as { name?: string }).name ?? "target"} department${direction === "agent" && targetAgent ? ` for ${targetAgent.name}` : ""}`,
      kind: "system",
      visibility: "public",
    });
    publishTicketEvent(id, "comment");

    return NextResponse.json({ ticket: stripAttachmentData(updatedTicket), transfer: updatedTicket?.transfer ?? null }, { status: 201 });
  } catch (error) {
    console.error("POST /api/tickets/[id]/transfer error:", error);
    return NextResponse.json({ error: "Failed to send transfer" }, { status: 500 });
  }
}

/**
 * Approve or reject a pending transfer. Only the receiving manager of the
 * target department may decide (managers settle transfers between themselves).
 * - approve + direction="agent": the ticket moves to the target department and
 *   lands directly on the chosen agent (assignedBy = approving manager).
 * - approve + direction="manager": the ticket moves to the target department
 *   unassigned — the manager assigns a team member as usual.
 * - reject: the transfer is cleared and the sender is notified.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Managers-only decision right: department-to-department transfers are
    // settled between the two managers; the super admin oversees but never
    // decides (canDecideTransfer enforces the same rule).
    const authResult = await requireApiRole("manager");
    if (authResult instanceof NextResponse) return authResult;
    const user = authResult;
    const { id } = await params;
    await connectDB();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid ticket ID" }, { status: 400 });
    }

    const ticket = await Ticket.findById(id).lean();
    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    if (!canDecideTransfer({ id: user.id, role: user.role, departmentId: user.departmentId }, ticket.transfer)) {
      return NextResponse.json(
        { error: "Only the receiving department's manager can decide this transfer" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = decideSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    if (parsed.data.action === "reject") {
      const fromId = ticket.transfer!.fromId.toString();
      const reason = parsed.data.reason?.trim() ?? "";
      await Ticket.findByIdAndUpdate(id, {
        $set: {
          "transfer.status": "rejected",
          "transfer.rejectedBy": new mongoose.Types.ObjectId(user.id),
          "transfer.rejectedAt": new Date(),
          "transfer.rejectionReason": reason,
        },
      });
      await notify([{ id: fromId }], {
        type: "transfer_rejected",
        ticketId: id,
        ticketNumber: ticket.ticketNumber,
        title: `Transfer rejected: ${ticket.ticketNumber}`,
        body: reason ? `${ticket.title} — ${reason}` : ticket.title,
      });
      // System event: the denial (and reason) lands in the conversation too.
      await Comment.create({
        ticketId: new mongoose.Types.ObjectId(id),
        authorId: new mongoose.Types.ObjectId(user.id),
        body: `${user.name ?? "Someone"} rejected the transfer${reason ? ` — ${reason}` : ""}. The ticket stays in its current department.`,
        kind: "system",
        visibility: "public",
      });
      publishTicketEvent(id, "comment");
      return NextResponse.json({ success: true, status: "rejected" });
    }

    // Approve.
    const transfer = ticket.transfer!;
    const targetDeptId = transfer.toDepartmentId;
    const update: Record<string, unknown> = {
      departmentId: targetDeptId,
      "transfer.status": "approved",
      "transfer.approvedBy": new mongoose.Types.ObjectId(user.id),
      "transfer.approvedAt": new Date(),
    };

    if (transfer.direction === "agent" && transfer.toUserId) {
      update.assigneeId = transfer.toUserId;
      update.assignedBy = new mongoose.Types.ObjectId(user.id);
    } else {
      // direction="manager": leave unassigned for the receiving manager.
      update.assigneeId = null;
      update.assignedBy = null;
    }

    const updatedTicket = await Ticket.findByIdAndUpdate(id, { $set: update }, { returnDocument: "after" })
      .populate("requesterId", "name email")
      .populate("assigneeId", "name email")
      .populate("departmentId", "name color")
      .populate(TRANSFER_POPULATE)
      .lean();

    // Notify the sender + the agent (if directly assigned).
    const recipients: string[] = [transfer.fromId.toString()];
    if (update.assigneeId) {
      recipients.push(update.assigneeId.toString());
    }
    await notify(
      recipients.map((rid) => ({ id: rid })),
      {
        type: "transfer_approved",
        ticketId: id,
        ticketNumber: ticket.ticketNumber,
        title: `Transfer approved: ${ticket.ticketNumber}`,
        body: ticket.title,
      }
    );

    // System event in the conversation: the receiving manager's decision.
    await Comment.create({
      ticketId: new mongoose.Types.ObjectId(id),
      authorId: new mongoose.Types.ObjectId(user.id),
      body: `${user.name ?? "Someone"} approved the transfer — ticket moved to ${(updatedTicket?.departmentId as { name?: string } | null)?.name ?? "the target department"}${update.assigneeId ? " and assigned it" : " (awaiting assignment)"}`,
      kind: "system",
      visibility: "public",
    });
    publishTicketEvent(id, "comment");

    return NextResponse.json({ ticket: stripAttachmentData(updatedTicket), status: "approved" });
  } catch (error) {
    console.error("PATCH /api/tickets/[id]/transfer error:", error);
    return NextResponse.json({ error: "Failed to decide transfer" }, { status: 500 });
  }
}
