"use client";

import { useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Shown on /login and /signup when the visitor already has a session.
 * Replaces the old auto-redirect: during development you must be able to
 * reach the login form while signed in (to switch accounts), so the page
 * stays put and offers an explicit "open workspace" instead of bouncing.
 */
export function SignedInPanel() {
  const { data: session } = useSession();
  const router = useRouter();
  const [switching, setSwitching] = useState(false);

  if (!session?.user) return null;

  const user = session.user as { name?: string; email?: string; role?: string };
  const isClient = user.role === "client";
  const workspaceHref = isClient ? "/client/tickets" : "/dashboard/overview";
  const otherHref = isClient ? "/login" : "/client/tickets";

  const switchAccount = async () => {
    setSwitching(true);
    await signOut({ redirect: false });
    router.push("/login");
  };

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-5 shadow-sm",
        "mb-6"
      )}
      data-testid="signed-in-panel"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary-muted">
          <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            Already signed in as{" "}
            <span className="font-mono text-[0.8125rem]">{user.email}</span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Role: {user.role ?? "unknown"} · sign out below to use this form for
            a different account.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => router.push(workspaceHref)}>
              Open workspace
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={switchAccount}
              disabled={switching}
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden />
              {switching ? "Signing out…" : "Switch account"}
            </Button>
            {isClient ? (
              <Button size="sm" variant="ghost" onClick={() => router.push("/login")}>
                Staff sign-in
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => router.push(otherHref)}>
                Client portal
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
