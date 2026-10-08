import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongo";
import { Ticket, TicketReadState } from "@/lib/db/models";
import { requireApiRole, canAccessTicket } from "@/lib/authz";
import mongoose from "mongoose";

export const dynamic = "force-dynamic";

/**
 * GET — participants' read markers for ✓✓ receipts. Returns one row per user
 * who has ever opened the conversation. Access follows the same
 * canAccessTicket rules as the conversation itself.
 */
export async function GET(
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

    const states = await TicketReadState.find({ ticketId: id })
      .select("userId lastReadAt")
      .lean();

    return NextResponse.json({
      readStates: states.map((s) => ({
        userId: s.userId.toString(),
        lastReadAt: s.lastReadAt,
      })),
    });
  } catch (error) {
    console.error("GET /api/tickets/[id]/read-state error:", error);
    return NextResponse.json({ error: "Failed to load read state" }, { status: 500 });
  }
}
