import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { redirectUnauthenticatedFrom } from "@/lib/authRedirects";

const protectedPaths = [
  "/dashboard",
  "/client",
  "/api/tickets",
  "/api/transfers",
  "/api/users",
  "/api/departments",
  "/api/stats",
  "/api/routing",
  "/api/notifications",
  "/api/categories",
];

// Universal edge-tier rate limiting and request throttling (per-IP, in-memory).
// Protects free-tier serverless execution, Atlas DB IOPS, and memory.
const MAX_RATE_ENTRIES = 10_000;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
const burstBuckets = new Map<string, { count: number; resetAt: number }>();

function checkEdgeRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { limited: boolean; limit: number; remaining: number; retryAfter: number; resetAt: number } {
  const now = Date.now();
  if (rateBuckets.size > MAX_RATE_ENTRIES / 2) {
    for (const [k, entry] of rateBuckets) {
      if (now > entry.resetAt) rateBuckets.delete(k);
    }
  }
  if (rateBuckets.size >= MAX_RATE_ENTRIES) {
    rateBuckets.clear();
  }

  const entry = rateBuckets.get(key);
  if (!entry || now > entry.resetAt) {
    const resetAt = now + windowMs;
    rateBuckets.set(key, { count: 1, resetAt });
    return {
      limited: false,
      limit,
      remaining: limit - 1,
      retryAfter: Math.ceil(windowMs / 1000),
      resetAt,
    };
  }

  entry.count += 1;
  const isLimited = entry.count > limit;
  const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
  const remaining = Math.max(0, limit - entry.count);

  return { limited: isLimited, limit, remaining, retryAfter, resetAt: entry.resetAt };
}

function checkEdgeBurstThrottle(ip: string, maxBurst = 15, windowMs = 2000): boolean {
  const now = Date.now();
  if (burstBuckets.size > MAX_RATE_ENTRIES / 2) {
    for (const [k, entry] of burstBuckets) {
      if (now > entry.resetAt) burstBuckets.delete(k);
    }
  }
  if (burstBuckets.size >= MAX_RATE_ENTRIES) {
    burstBuckets.clear();
  }

  const entry = burstBuckets.get(ip);
  if (!entry || now > entry.resetAt) {
    burstBuckets.set(ip, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count += 1;
  return entry.count > maxBurst;
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Cost Control: reject excessive request payloads before buffering
  const contentLength = request.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > 10 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Payload too large. Maximum 10MB allowed." },
      { status: 413 }
    );
  }

  // Universal API rate limiting & throttling
  if (pathname.startsWith("/api/")) {
    const isSessionRefresh = request.method === "GET" && pathname.startsWith("/api/auth/session");

    if (!isSessionRefresh) {
      const xff = request.headers.get("x-forwarded-for");
      const ip =
        (xff ? xff.split(",").map((s) => s.trim()).filter(Boolean).pop() : undefined) ||
        request.headers.get("x-real-ip") ||
        "unknown";

      const isDev = process.env.NODE_ENV !== "production";

      // 1. Burst throttle: prevent short-window script hammering (relaxed in dev)
      if (checkEdgeBurstThrottle(ip, isDev ? 200 : 15, 2000)) {
        return NextResponse.json(
          { error: "Too many rapid requests. Please slow down." },
          { status: 429, headers: { "Retry-After": "2" } }
        );
      }

      // 2. Differentiated tiered rate limits
      let tierLimit = isDev ? 600 : 120; // General reads
      let bucketPrefix = "read";

      if (pathname.startsWith("/api/auth")) {
        tierLimit = isDev ? 100 : 15; // Auth endpoints
        bucketPrefix = "auth";
      } else if (request.method !== "GET" && request.method !== "HEAD") {
        tierLimit = isDev ? 200 : 45; // Mutations
        bucketPrefix = "mutation";
      }

      const rateCheck = checkEdgeRateLimit(`${bucketPrefix}:${ip}`, tierLimit, 60_000);
      if (rateCheck.limited) {
        return NextResponse.json(
          { error: "Too many requests. Please try again later.", retryAfter: rateCheck.retryAfter },
          {
            status: 429,
            headers: {
              "Retry-After": rateCheck.retryAfter.toString(),
              "X-RateLimit-Limit": rateCheck.limit.toString(),
              "X-RateLimit-Remaining": rateCheck.remaining.toString(),
              "X-RateLimit-Reset": Math.ceil(rateCheck.resetAt / 1000).toString(),
            },
          }
        );
      }
    }
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
    "/api/:path*",
    "/login",
    "/signup",
  ],
};
