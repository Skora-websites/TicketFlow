import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongo";
import { Ticket, User } from "@/lib/db/models";
import { requireApiRole, canAccessTicket } from "@/lib/authz";
import { touchPresence, listPresence } from "@/lib/runtime";
import mongoose from "mongoose";

export const dynamic = "force-dynamic";

/**
 * Collision detection (UX-IDEAS X2): "who else is looking at this ticket?"
 *
 * POST touches the caller's presence in the ticket's zone and returns the
 * OTHER staff currently viewing (callers never see themselves). Presence is
 * ephemeral — 30s TTL, refreshed by the client every ~10s — so closed tabs
 * disappear without any cleanup path.
 *
 * Staff-only: clients don't get a viewer roster. Names/roles are resolved
 * fresh per poll (zones hold a handful of ids; one indexed query).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiRole("team", "manager", "super_admin");
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

    const zone = `ticket:${id}`;
    await touchPresence(zone, user.id);
    const members = await listPresence(zone);

    const otherIds = members.map((m) => m.id).filter((pid) => pid !== user.id);
    const lastSeenById = new Map(members.map((m) => [m.id, m.lastSeenAt]));

    const viewers =
      otherIds.length > 0
        ? (
            await User.find({ _id: { $in: otherIds }, active: true })
              .select("name role")
              .lean()
          ).map((u) => ({
            id: String(u._id),
            name: (u as { name: string }).name,
            role: (u as { role: string }).role,
            lastSeenAt: lastSeenById.get(String(u._id)) ?? null,
          }))
        : [];

    return NextResponse.json({ viewers });
  } catch (error) {
    console.error("POST /api/tickets/[id]/presence error:", error);
    return NextResponse.json({ error: "Failed to update presence" }, { status: 500 });
  }
}
