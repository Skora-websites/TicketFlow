import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongo";
import { Notification } from "@/lib/db/models";
import { getUser } from "@/lib/authz";

export async function POST() {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    await Notification.updateMany({ userId: user.id, read: false }, { read: true });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/notifications/read-all error:", error);
    return NextResponse.json({ error: "Failed to update notifications" }, { status: 500 });
  }
}
