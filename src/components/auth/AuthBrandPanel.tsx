import Link from "next/link";
import { Badge } from "@/components/ui/badge";

/**
 * Split-panel brand panel for auth pages. Desktop (lg+) only — mobile renders
 * the small brand header inline on each page instead.
 */
export function AuthBrandPanel() {
  return (
    <aside className="hidden lg:flex flex-col justify-between bg-[hsl(222_35%_13%)] text-white p-12">
      <Link href="/" className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary font-display text-lg font-bold text-primary-foreground">T</span>
        <span className="font-display text-xl font-bold tracking-tight">TicketFlow</span>
      </Link>

      <div className="max-w-md">
        <p className="font-display text-3xl font-semibold leading-tight tracking-tight text-white">
          Support requests arrive. Somebody has to answer them.
        </p>
        <div className="mt-8 rounded-xl border border-white/15 bg-white/5 overflow-hidden">
          <div className="grid grid-cols-[86px_1fr_auto] items-center gap-3 border-b border-white/10 px-5 py-3.5">
            <span className="font-mono text-xs text-white/60">TK-0042</span>
            <span className="truncate text-sm font-medium">Login page not loading on mobile</span>
            <span className="flex gap-1.5">
              <Badge variant="destructive" className="text-[11px]">High</Badge>
              <Badge variant="warning" className="text-[11px]">In progress</Badge>
            </span>
          </div>
          <div className="grid grid-cols-[86px_1fr_auto] items-center gap-3 px-5 py-3.5">
            <span className="font-mono text-xs text-white/60">TK-0029</span>
            <span className="truncate text-sm font-medium">Marketing campaign landing page</span>
            <span className="flex gap-1.5">
              <Badge variant="destructive" className="text-[11px]">High</Badge>
              <Badge variant="success" className="text-[11px]">Resolved</Badge>
            </span>
          </div>
        </div>
        <p className="font-mono text-xs text-white/50 mt-3">Every request becomes a ticket. Tickets go somewhere.</p>
      </div>

      <p className="text-sm text-white/50">© 2026 TicketFlow</p>
    </aside>
  );
}

/** Compact brand header for the mobile (single-column) auth layout. */
export function AuthBrandHeader() {
  return (
    <div className="flex justify-center mb-8 lg:hidden">
      <Link href="/" className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary font-display font-bold text-primary-foreground">T</span>
        <span className="font-display text-lg font-bold tracking-tight text-foreground">TicketFlow</span>
      </Link>
    </div>
  );
}
