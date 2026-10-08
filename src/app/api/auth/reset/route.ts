import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { connectDB } from "@/lib/db/mongo";
import { User } from "@/lib/db/models";
import { sendPasswordResetEmail, isSmtpConfigured } from "@/lib/mailer";
import { z } from "zod";

const schema = z.object({ email: z.string().email() });

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }
    const { email } = parsed.data;

    await connectDB();
    let devToken: string | undefined;
    const user = await User.findOne({ email: email.toLowerCase() });
    if (user) {
      const token = randomBytes(32).toString("hex");
      const hashed = createHash("sha256").update(token).digest("hex");
      user.passwordResetToken = hashed;
      user.passwordResetExpires = new Date(Date.now() + 30 * 60 * 1000);
      await user.save();
      await sendPasswordResetEmail(user.email, token);
      devToken = token;
    }

    const payload: Record<string, unknown> = {
      message: "If an account exists, a reset link has been sent.",
    };

    // Dev-only fallback: with no SMTP configured the email can never be
    // delivered, so surface the reset link directly in non-production so the
    // flow is actually testable. Never enabled in production.
    if (user && devToken && !isSmtpConfigured() && process.env.NODE_ENV !== "production") {
      payload.devResetUrl = `/reset-password/${devToken}`;
      payload.message =
        "SMTP is not configured — in development the reset link is returned here instead of being emailed.";
    }

    return NextResponse.json(payload);
  } catch (error) {
    console.error("POST /api/auth/reset error:", error);
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
  }
}
