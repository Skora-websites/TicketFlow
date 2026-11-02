import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { connectDB } from "@/lib/db/mongo";
import { AuthSession } from "@/lib/db/models";
import { invalidateSessionCheck } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const isSecure =
    request.url.startsWith("https://") ||
    request.headers.get("x-forwarded-proto") === "https";

  const secret =
    process.env.AUTH_SECRET ||
    "ticketflow-session-secret-key-32chars-min-prod-fallback";

  try {
    let token = await getToken({ req: request, secret, secureCookie: isSecure });
    if (!token) {
      token = await getToken({ req: request, secret, secureCookie: !isSecure });
    }
    if (!token && isSecure) {
      token = await getToken({
        req: request,
        secret,
        secureCookie: true,
        cookieName: "__Secure-next-auth.session-token",
      });
    }

    if (token?.sessionId) {
      await connectDB();
      await AuthSession.updateOne(
        { sessionId: token.sessionId },
        { $set: { isValid: false } }
      );
    }

    if (token?.id && typeof token.id === "string") {
      invalidateSessionCheck(token.id);
    }
  } catch (err) {
    console.warn("Error during logout session invalidation:", err);
  }

  const response = NextResponse.json({ success: true, message: "Logged out successfully" });

  const cookieNames = [
    "authjs.session-token",
    "__Secure-authjs.session-token",
    "next-auth.session-token",
    "__Secure-next-auth.session-token",
    "rm",
    "authjs.csrf-token",
    "__Host-authjs.csrf-token",
  ];

  for (const name of cookieNames) {
    response.cookies.set(name, "", {
      path: "/",
      maxAge: 0,
      expires: new Date(0),
      httpOnly: name !== "rm",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }

  return response;
}
