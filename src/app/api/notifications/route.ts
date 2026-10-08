import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongo";
import { Notification } from "@/lib/db/models";
import { getUser } from "@/lib/authz";

export const dynamic = "force-dynamic";

// Persisted, per-user notifications with read/unread state. Replaces the old
// derived-only "open tickets" proxy.
export async function GET(request: Request) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    // ?all=1 raises the limit for the full notifications page; the bell
    // dropdown only needs the most recent 20.
    const url = new URL(request.url);
    const limit = url.searchParams.get("all") === "1" ? 100 : 20;

    const [items, unreadCount] = await Promise.all([
      Notification.find({ userId: user.id }).sort({ createdAt: -1 }).limit(limit).lean(),
      Notification.countDocuments({ userId: user.id, read: false }),
    ]);

    return NextResponse.json({
      notifications: items.map((n) => ({
        id: n._id.toString(),
        type: n.type,
        ticketId: n.ticketId.toString(),
        ticketNumber: n.ticketNumber,
        title: n.title,
        body: n.body,
        read: n.read,
        createdAt: n.createdAt,
      })),
      unreadCount,
    });
  } catch (error) {
    console.error("GET /api/notifications error:", error);
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }
}
