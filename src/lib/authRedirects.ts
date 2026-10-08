import { NextResponse } from "next/server";

/**
 * Login-redirect builder shared by middleware and API routes.
 * Only the unauthenticated direction lives here — the authenticated
 * direction (bouncing users off /login) deliberately does NOT run in
 * middleware, because a server-side 307 makes the browser Back button
 * bounce forever (Back → /login → 307 → app → Back → ...).
 * See src/app/login/page.tsx for the client-side equivalent.
 */
export function redirectUnauthenticatedFrom(
  pathname: string,
  origin: string
): NextResponse | null {
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set("callbackUrl", pathname);
  return NextResponse.redirect(loginUrl);
}
