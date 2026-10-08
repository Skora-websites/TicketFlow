import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { connectDB } from "@/lib/db/mongo";
import { User } from "@/lib/db/models";
import { hashPassword } from "@/lib/password";
import { z } from "zod";

const schema = z.object({ password: z.string().min(8) });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    await connectDB();
    const hashed = createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({
      passwordResetToken: hashed,
      passwordResetExpires: { $gt: new Date() },
    });
    if (!user) {
      return NextResponse.json({ error: "Invalid or expired reset token" }, { status: 400 });
    }

    user.passwordHash = await hashPassword(parsed.data.password);
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    // Invalidate every JWT minted before the reset — a stolen session no
    // longer survives a password change.
    user.sessionVersion = (user.sessionVersion ?? 0) + 1;
    await user.save();

    return NextResponse.json({ message: "Password reset successful" });
  } catch (error) {
    console.error("POST /api/auth/reset/[token] error:", error);
    return NextResponse.json({ error: "Failed to reset password" }, { status: 500 });
  }
}
