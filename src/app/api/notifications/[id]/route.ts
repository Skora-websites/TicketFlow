import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongo";
import { Notification } from "@/lib/db/models";
import { getUser } from "@/lib/authz";
import mongoose from "mongoose";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid notification ID" }, { status: 400 });
    }

    let read = true;
    try {
      const body = await _request.json();
      if (typeof body?.read === "boolean") {
        read = body.read;
      }
    } catch {
      // default read: true
    }

    await connectDB();

    const updated = await Notification.findOneAndUpdate(
      { _id: id, userId: user.id },
      { read },
      { returnDocument: "after" }
    ).lean();

    if (!updated) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PATCH /api/notifications/[id] error:", error);
    return NextResponse.json({ error: "Failed to update notification" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid notification ID" }, { status: 400 });
    }

    await connectDB();

    const deleted = await Notification.findOneAndDelete({ _id: id, userId: user.id }).lean();

    if (!deleted) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/notifications/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete notification" }, { status: 500 });
  }
}
