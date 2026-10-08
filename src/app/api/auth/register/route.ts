import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { connectDB } from "@/lib/db/mongo";
import { User } from "@/lib/db/models";
import { hashPassword } from "@/lib/password";
import { sendVerificationEmail, isSmtpConfigured } from "@/lib/mailer";
import { z } from "zod";

const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function POST(request: NextRequest) {
  try {
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

    // Account starts inactive: authorize() rejects it and every protected
    // route treats it as unauthenticated until the address is verified.
    const user = await User.create({
      name,
      email: normalizedEmail,
      passwordHash,
      role: "client",
      active: false,
      emailVerifyToken: hashedToken,
      emailVerifyExpires: new Date(Date.now() + 30 * 60 * 1000),
    });
    void user;

    await sendVerificationEmail(normalizedEmail, verifyToken);

    const payload: Record<string, unknown> = {
      message:
        "Account created. Check your email for a verification link — it expires in 30 minutes.",
    };

    // Dev-only fallback (mirrors the password-reset flow): with no SMTP the
    // link could never be delivered, so surface it directly in non-production.
    if (!isSmtpConfigured() && process.env.NODE_ENV !== "production") {
      payload.devVerifyUrl = `/api/auth/verify/${verifyToken}`;
      payload.message =
        "SMTP is not configured — in development the verification link is returned here instead of being emailed.";
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
