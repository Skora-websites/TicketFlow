import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongo";
import { Notification } from "@/lib/db/models";
import { getUser } from "@/lib/authz";
import mongoose from "mongoose";

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

// Bulk update notifications (e.g., mark multiple as read or unread)
export async function PATCH(request: Request) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { ids, read } = body as { ids?: string[]; read?: boolean };

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "No notification IDs provided" }, { status: 400 });
    }

    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0) {
      return NextResponse.json({ error: "No valid IDs provided" }, { status: 400 });
    }

    await connectDB();
    await Notification.updateMany(
      { _id: { $in: validIds }, userId: user.id },
      { read: typeof read === "boolean" ? read : true }
    );

    return NextResponse.json({ success: true, count: validIds.length });
  } catch (error) {
    console.error("PATCH /api/notifications error:", error);
    return NextResponse.json({ error: "Failed to bulk update notifications" }, { status: 500 });
  }
}

// Bulk delete notifications (e.g. clear all or delete selected)
export async function DELETE(request: Request) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: { ids?: string[]; all?: boolean } = {};
    try {
      body = await request.json();
    } catch {
      // no body, check search params
    }

    const url = new URL(request.url);
    const clearAll = body.all || url.searchParams.get("all") === "1";

    await connectDB();

    if (clearAll) {
      const result = await Notification.deleteMany({ userId: user.id });
      return NextResponse.json({ success: true, count: result.deletedCount });
    }

    const ids = body.ids || [];
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "No notification IDs provided" }, { status: 400 });
    }

    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    const result = await Notification.deleteMany({
      _id: { $in: validIds },
      userId: user.id,
    });

    return NextResponse.json({ success: true, count: result.deletedCount });
  } catch (error) {
    console.error("DELETE /api/notifications error:", error);
    return NextResponse.json({ error: "Failed to delete notifications" }, { status: 500 });
  }
}
