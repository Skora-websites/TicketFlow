"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  TicketCheck,
  Plus,
  Inbox,
  Send,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const role = session?.user?.role;
  const isClient = role === "client";
  const isManagerOrAdmin = role === "manager" || role === "super_admin";

  // Real-time unassigned count badge for manager/super_admin
  const [unassignedCount, setUnassignedCount] = useState<number | null>(null);

  useEffect(() => {
    if (!isManagerOrAdmin) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/stats");
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setUnassignedCount(data.unassignedTickets ?? 0);
        }
      } catch {
        /* non-critical badge fetch */
      }
    };
    load();
    const interval = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isManagerOrAdmin]);

  const viewParam = searchParams.get("view");
  const isCurrent = (href: string) => {
    const [path, search] = href.split("?");
    if (pathname !== path) return false;
    if (!search) return !viewParam || viewParam === "all";
    const expectedView = new URLSearchParams(search).get("view");
    return viewParam === expectedView;
  };

  const openDrawer = () => {
    window.dispatchEvent(new CustomEvent("toggle-mobile-sidebar"));
  };

  if (!session?.user) return null;

  return (
    <nav
      aria-label="Mobile Navigation"
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur-md lg:hidden pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex h-14 items-center justify-around px-2">
        {isClient ? (
          <>
            <Link
              href="/client/tickets"
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 py-1 text-[11px] font-semibold transition-colors",
                isCurrent("/client/tickets")
                  ? "text-foreground font-bold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <TicketCheck className="h-5 w-5" />
              <span>Tickets</span>
            </Link>

            {/* Elevated FAB Create Button */}
            <div className="flex flex-1 justify-center">
              <Link
                href="/client/tickets/new"
                className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-accent-foreground shadow-md transition-transform active:scale-95 hover:opacity-90"
                aria-label="Create New Ticket"
              >
                <Plus className="h-5 w-5 stroke-[2.5]" />
              </Link>
            </div>

            <button
              type="button"
              onClick={openDrawer}
              className="flex flex-1 flex-col items-center justify-center gap-1 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
              <span>Menu</span>
            </button>
          </>
        ) : (
          <>
            {/* Overview / Home */}
            <Link
              href="/dashboard/overview"
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 py-1 text-[11px] font-semibold transition-colors",
                pathname === "/dashboard/overview"
                  ? "text-foreground font-bold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <LayoutDashboard className="h-5 w-5" />
              <span>Home</span>
            </Link>

            {/* Tickets */}
            <Link
              href={isManagerOrAdmin ? "/dashboard/tickets" : "/dashboard/tickets?view=mine"}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 py-1 text-[11px] font-semibold transition-colors",
                pathname === "/dashboard/tickets" && (!viewParam || viewParam === "mine" || viewParam === "all")
                  ? "text-foreground font-bold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <TicketCheck className="h-5 w-5" />
              <span>Tickets</span>
            </Link>

            {/* Signature High-Contrast FAB */}
            <div className="flex flex-1 justify-center">
              <Link
                href="/dashboard/tickets/new"
                className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-accent-foreground shadow-md transition-transform active:scale-95 hover:opacity-90"
                aria-label="Create New Ticket"
              >
                <Plus className="h-5 w-5 stroke-[2.5]" />
              </Link>
            </div>

            {/* Queue (Managers) or Sent (Agents) */}
            {isManagerOrAdmin ? (
              <Link
                href="/dashboard/queue"
                className={cn(
                  "relative flex flex-1 flex-col items-center justify-center gap-1 py-1 text-[11px] font-semibold transition-colors",
                  pathname === "/dashboard/queue"
                    ? "text-foreground font-bold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <div className="relative">
                  <Inbox className="h-5 w-5" />
                  {typeof unassignedCount === "number" && unassignedCount > 0 && (
                    <span className="absolute -top-1 -right-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 font-mono text-[9px] font-bold text-white">
                      {unassignedCount > 99 ? "99+" : unassignedCount}
                    </span>
                  )}
                </div>
                <span>Queue</span>
              </Link>
            ) : (
              <Link
                href="/dashboard/tickets?view=sent"
                className={cn(
                  "flex flex-1 flex-col items-center justify-center gap-1 py-1 text-[11px] font-semibold transition-colors",
                  pathname === "/dashboard/tickets" && viewParam === "sent"
                    ? "text-foreground font-bold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Send className="h-5 w-5" />
                <span>Sent</span>
              </Link>
            )}

            {/* Menu Drawer */}
            <button
              type="button"
              onClick={openDrawer}
              className="flex flex-1 flex-col items-center justify-center gap-1 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Open full menu"
            >
              <Menu className="h-5 w-5" />
              <span>More</span>
            </button>
          </>
        )}
      </div>
    </nav>
  );
}
