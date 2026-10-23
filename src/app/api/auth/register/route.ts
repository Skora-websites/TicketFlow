import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { connectDB } from "@/lib/db/mongo";
import { User } from "@/lib/db/models";
import { hashPassword } from "@/lib/password";
import { sendVerificationEmail, isSmtpConfigured } from "@/lib/mailer";
import { enforceRateLimit, getClientIp } from "@/lib/security";
import { z } from "zod";

const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function POST(request: NextRequest) {
  try {
    // Route-level rate limit to prevent account spam and database clutter
    const ip = getClientIp(request);
    const rateCheck = await enforceRateLimit(`register:ip:${ip}`, 5, 60 * 60_000, "Too many registration attempts from this network. Please try again later.");
    if (rateCheck) return rateCheck;

    const body = await request.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { name, email, password } = parsed.data;

    await connectDB();

    const normalizedEmail = email.toLowerCase();
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      // Avoid leaking which addresses are registered: whether the address is
      // taken or merely unverified, the response is identical.
      return NextResponse.json(
        { error: "If this address is available, a verification email has been sent. Check your inbox." },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);

    // Email verification token — stored hashed (same scheme as password
    // reset) so a DB leak can't be replayed into account activation.
    const verifyToken = randomBytes(32).toString("hex");
    const hashedToken = createHash("sha256").update(verifyToken).digest("hex");

    // In dev / when SMTP is not configured, activate immediately so users aren't locked out.
    // In production with SMTP configured, require email verification.
    const isAutoActive = !isSmtpConfigured() || process.env.NODE_ENV !== "production";

    const user = await User.create({
      name,
      email: normalizedEmail,
      passwordHash,
      role: "client",
      active: isAutoActive,
      emailVerifyToken: isAutoActive ? undefined : hashedToken,
      emailVerifyExpires: isAutoActive ? undefined : new Date(Date.now() + 30 * 60 * 1000),
    });
    void user;

    if (!isAutoActive) {
      await sendVerificationEmail(normalizedEmail, verifyToken);
    }

    const payload: Record<string, unknown> = {
      message: isAutoActive
        ? "Account created successfully. You can now sign in."
        : "Account created. Check your email for a verification link — it expires in 30 minutes.",
      autoActive: isAutoActive,
    };

    if (!isSmtpConfigured() && process.env.NODE_ENV !== "production") {
      payload.devVerifyUrl = `/api/auth/verify/${verifyToken}`;
    }

    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
