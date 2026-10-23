import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongo";
import { User } from "@/lib/db/models";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || id.length !== 24) {
      return new NextResponse(null, { status: 404 });
    }

    await connectDB();
    const user = await User.findById(id).select("avatar").lean();
    if (!user || !user.avatar) {
      return new NextResponse(null, { status: 404 });
    }

    const avatar = user.avatar;

    // If it's a data URL, parse MIME and buffer and return binary image response
    if (avatar.startsWith("data:")) {
      const matches = avatar.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) {
        return new NextResponse(null, { status: 404 });
      }
      const mimeType = matches[1];
      const buffer = Buffer.from(matches[2], "base64");

      return new NextResponse(buffer, {
        headers: {
          "Content-Type": mimeType,
          "Content-Length": buffer.length.toString(),
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        },
      });
    }

    // If it's an external URL, redirect
    if (avatar.startsWith("http://") || avatar.startsWith("https://")) {
      return NextResponse.redirect(avatar);
    }

    return new NextResponse(null, { status: 404 });
  } catch (error) {
    console.error("GET /api/users/[id]/avatar error:", error);
    return new NextResponse(null, { status: 500 });
  }
}
