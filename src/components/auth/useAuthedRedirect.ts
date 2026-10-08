"use client";

/**
 * Placeholder for the removed auto-redirect hook.
 * Middleware no longer bounces authed users off /login (that made the
 * browser Back button an inescapable loop), and pages no longer auto-reroute
 * either: during dev you need to reach the login form to switch accounts.
 * Auth pages now show a SignedInPanel with explicit actions instead.
 * Kept as a named export so older imports keep resolving.
 */
export function useAuthedRedirect() {
  /* intentionally inert */
}
