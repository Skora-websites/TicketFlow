import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { connectDB } from "@/lib/db/mongo";
import { User } from "@/lib/db/models";

export const dynamic = "force-dynamic";

// Email-verification link target. The token arrives in the URL as the raw
// random value; it is hashed and matched against the stored hash (which also
// makes the stored value useless for replay if the DB leaks). Single use and
// time-limited; always ends in a redirect so the link works from any mail
// client — JSON errors would render as raw text in the browser.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const loginUrl = new URL("/login", _request.url);

  try {
    const { token } = await params;
    if (!token || token.length < 32 || token.length > 128 || !/^[a-f0-9]+$/i.test(token)) {
      loginUrl.searchParams.set("verified", "invalid");
      return NextResponse.redirect(loginUrl);
    }

    await connectDB();
    const hashed = createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      emailVerifyToken: hashed,
      emailVerifyExpires: { $gt: new Date() },
    });

    if (!user) {
      // Expired, already used, or bogus token — same message for all three.
      loginUrl.searchParams.set("verified", "invalid");
      return NextResponse.redirect(loginUrl);
    }

    user.active = true;
    user.emailVerified = new Date();
    user.emailVerifyToken = undefined;
    user.emailVerifyExpires = undefined;
    await user.save();

    loginUrl.searchParams.set("verified", "true");
    return NextResponse.redirect(loginUrl);
  } catch (error) {
    console.error("GET /api/auth/verify/[token] error:", error);
    loginUrl.searchParams.set("verified", "invalid");
    return NextResponse.redirect(loginUrl);
  }
}
