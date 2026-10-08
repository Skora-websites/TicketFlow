import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/mongo";
import { Ticket } from "@/lib/db/models";
import { requireApiRole } from "@/lib/authz";
import { stripAttachmentData } from "@/lib/attachments";

export const dynamic = "force-dynamic";

// Manager approval inbox: every ticket with a PENDING inter-department
// transfer addressed to this manager's department (or explicitly to them).
// Reading the inbox marks the transfers as seen (transfer.readAt) so the
// sender's "Sent" view can show received-state; fire-and-forget, never blocks
// the response. Managers-only: transfers are settled between managers; the
// super admin oversees but has no inbox and no deciding vote.
export async function GET() {
  try {
    const authResult = await requireApiRole("manager");
    if (authResult instanceof NextResponse) return authResult;
    const user = authResult;
    await connectDB();

    const filter: Record<string, unknown> = {
      "transfer.status": "pending",
    };
    if (!user.departmentId) {
      // Dept-less manager has no receiving queue — they could never be the
      // resolved target manager (transfer POST requires a dept manager).
      return NextResponse.json({ transfers: [] });
    }
    filter.$or = [
      { "transfer.toDepartmentId": new mongoose.Types.ObjectId(user.departmentId) },
      { "transfer.toManagerId": new mongoose.Types.ObjectId(user.id) },
    ];

    const tickets = await Ticket.find(filter)
      .populate("requesterId", "name email")
      .populate("assigneeId", "name email")
      .populate("departmentId", "name color")
      .populate("transfer.fromId", "name email role")
      .populate("transfer.toUserId", "name email")
      .populate("transfer.toManagerId", "name email")
      .populate("transfer.toDepartmentId", "name color")
      .populate("transfer.approvedBy", "name")
      .sort({ "transfer.sentAt": 1 }) // oldest first — longest-waiting on top
      .limit(50)
      .lean();

    // Mark as seen (received) — idempotent, no-op when already set.
    void Ticket.updateMany(
      { _id: { $in: tickets.map((t) => t._id) }, "transfer.readAt": null },
      { $set: { "transfer.readAt": new Date() } }
    ).exec();

    return NextResponse.json({
      transfers: (tickets as unknown as Record<string, unknown>[]).map(stripAttachmentData),
    });
  } catch (error) {
    console.error("GET /api/transfers/pending error:", error);
    return NextResponse.json({ error: "Failed to load pending transfers" }, { status: 500 });
  }
}
