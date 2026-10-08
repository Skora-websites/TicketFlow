import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { redirectUnauthenticatedFrom } from "@/lib/authRedirects";

const protectedPaths = ["/dashboard", "/client", "/api/tickets", "/api/transfers", "/api/users", "/api/departments", "/api/stats"];

// Fixed-window rate limiter for auth endpoints (per-IP, in-memory).
// Slows brute-force / credential-stuffing against /api/auth/*.
const AUTH_RATE_LIMIT = 15;
const AUTH_RATE_WINDOW_MS = 60_000;
const MAX_RATE_ENTRIES = 10_000;
const authHits = new Map<string, { count: number; resetAt: number }>();

function isAuthRateLimited(ip: string): boolean {
  const now = Date.now();
  // Periodically sweep expired entries so attacker-controlled keys (spoofed
  // X-Forwarded-For) cannot grow the map without bound (memory DoS).
  if (authHits.size > MAX_RATE_ENTRIES / 2) {
    for (const [key, entry] of authHits) {
      if (now > entry.resetAt) authHits.delete(key);
    }
  }
  if (authHits.size >= MAX_RATE_ENTRIES) {
    // Fail open for legit traffic rather than exhaust memory; the sweeper
    // above normally prevents reaching this point.
    authHits.clear();
  }
  const entry = authHits.get(ip);
  if (!entry || now > entry.resetAt) {
    authHits.set(ip, { count: 1, resetAt: now + AUTH_RATE_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > AUTH_RATE_LIMIT;
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rate-limit authentication endpoints to slow brute-force / abuse.
  // Session refreshes (GET /api/auth/session) are excluded: SessionProvider
  // refetches them on mount and every window focus, so counting them would
  // lock out legitimate users (multiple tabs / shared NAT IPs).
  const isSessionRefresh =
    request.method === "GET" && pathname.startsWith("/api/auth/session");
  if (pathname.startsWith("/api/auth") && !isSessionRefresh) {
    // Key on the rightmost X-Forwarded-For entry (added by the closest trusted
    // proxy). The leftmost entry is client-controlled and trivially rotated to
    // bypass the limiter; with no proxy in front, the header is absent and we
    // fall back to x-real-ip / a single shared bucket.
    const xff = request.headers.get("x-forwarded-for");
    const ip =
      (xff ? xff.split(",").map((s) => s.trim()).filter(Boolean).pop() : undefined) ||
      request.headers.get("x-real-ip") ||
      "unknown";
    if (isAuthRateLimited(ip)) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }
    return NextResponse.next();
  }

  const rawToken = await getToken({ req: request, secret: process.env.AUTH_SECRET });
  // Sessions re-validated in auth.ts: inactive/deleted users are logged out.
  const token = rawToken && rawToken.active === false ? null : rawToken;

  // Check if path is protected
  const isProtected = protectedPaths.some((path) => pathname.startsWith(path));

  // Redirect unauthenticated users from protected paths. API routes get a
  // JSON 401 so clients don't receive an HTML login page mid-fetch; pages
  // get the standard login redirect.
  if (isProtected && !token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const redirected = redirectUnauthenticatedFrom(pathname, request.url);
    if (redirected) return redirected;
  }

  // Auth pages (/login, /signup) are NOT server-redirected for logged-in
  // users: a server redirect turns the browser Back button into a bounce
  // loop (Back → /login → 307 → dashboard → Back → ...). Authed visitors
  // are gently rerouted client-side by the pages themselves via
  // router.replace(), which rewrites history instead of pinning entries.

  // Role-based route protection
  if (token) {
    const role = token.role as string;

    // Client trying to access internal dashboard
    if (role === "client" && pathname.startsWith("/dashboard")) {
      return NextResponse.redirect(new URL("/client/tickets", request.url));
    }

    // Internal users trying to access client portal
    if (role !== "client" && pathname.startsWith("/client")) {
      return NextResponse.redirect(new URL("/dashboard/overview", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/client/:path*",
    "/api/auth/:path*",
    "/api/tickets/:path*",
    "/api/transfers/:path*",
    "/api/users/:path*",
    "/api/departments/:path*",
    "/api/stats/:path*",
    "/api/routing/:path*",
    "/api/notifications/:path*",
    "/login",
    "/signup",
  ],
};
