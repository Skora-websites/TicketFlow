"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  BarChart3,
  Building2,
  Cpu,
  FolderKanban,
  Gauge,
  Hash,
  Inbox,
  LayoutDashboard,
  Plus,
  Search,
  Settings,
  TicketCheck,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useKeyboardLayer } from "./keyboard-layer";
import { ticketHref, type TicketCardTicket } from "./../../components/tickets/TicketCard";

/**
 * Inline header search — a plain field that lives in the topbar (no modal
 * overlay). Keeps the old command-palette behavior exactly:
 *   - staff ticket search: debounced 250ms, >= 2 chars, /api/tickets?search&limit=6
 *   - same navigate/manage/system destinations, role-gated the same way
 *   - "/" (keyboard layer) and Cmd/Ctrl+K focus the field
 * Results open in a small dropdown anchored under the field; the page itself
 * never gets covered by a dialog.
 */

type NavItem = { name: string; href: string; icon: React.ElementType };

const WORKSPACE_NAV: NavItem[] = [
  { name: "Overview", href: "/dashboard/overview", icon: LayoutDashboard },
  { name: "All Tickets", href: "/dashboard/tickets", icon: FolderKanban },
  { name: "My Tickets", href: "/dashboard/tickets?view=mine", icon: TicketCheck },
];

const MANAGE_NAV: NavItem[] = [
  { name: "Unassigned Queue", href: "/dashboard/queue", icon: Inbox },
  { name: "Team Workload", href: "/dashboard/workload", icon: Gauge },
  { name: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
  { name: "Routing", href: "/dashboard/routing", icon: Cpu },
  { name: "Users", href: "/dashboard/users", icon: Users },
];

const SYSTEM_NAV: NavItem[] = [{ name: "Departments", href: "/dashboard/departments", icon: Building2 }];

const CLIENT_NAV: NavItem[] = [{ name: "My Tickets", href: "/client/tickets", icon: TicketCheck }];

type TicketHit = TicketCardTicket & { _id: string };

interface Row {
  key: string;
  label: string;
  hint?: string;
  href: string;
  icon: React.ElementType;
  group: "tickets" | "navigate" | "manage" | "system";
}

export function HeaderSearch() {
  const router = useRouter();
  const { data: session } = useSession();
  const role = session?.user?.role;
  const isClient = role === "client";
  const base = isClient ? "/client" : "/dashboard";

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TicketHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      setQuery("");
      setResults([]);
      inputRef.current?.blur();
      router.push(href);
    },
    [router]
  );

  // Cmd/Ctrl+K focuses the field (the old palette used it to open a modal).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // "/" from the keyboard layer focuses the field too.
  const { registerSearchFocus } = useKeyboardLayer();
  useEffect(() => {
    registerSearchFocus(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [registerSearchFocus]);

  // Debounced ticket search (staff only — clients use the portal list).
  useEffect(() => {
    if (isClient) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/tickets?search=${encodeURIComponent(q)}&limit=6`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.tickets ?? []);
        }
      } catch {
        // best-effort; keep previous results
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, isClient]);

  // Flattened, query-filtered rows (mirrors the old palette's groups and its
  // client-side value filtering).
  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    const out: Row[] = [];

    if (!isClient && query.trim().length >= 2) {
      for (const t of results) {
        out.push({ key: `t-${t._id}`, label: t.title, hint: t.ticketNumber, href: ticketHref(t), icon: Hash, group: "tickets" });
      }
    }

    const push = (items: NavItem[], group: Row["group"]) => {
      for (const item of items) {
        if (q && !item.name.toLowerCase().includes(q)) continue;
        out.push({ key: `${group}-${item.name}`, label: item.name, href: item.href, icon: item.icon, group });
      }
    };

    if (isClient) {
      push(CLIENT_NAV, "navigate");
    } else {
      push(WORKSPACE_NAV, "navigate");
    }
    if (!q || "new ticket".includes(q)) {
      out.push({ key: "navigate-new-ticket", label: "New Ticket", href: `${base}/tickets/new`, icon: Plus, group: "navigate" });
    }

    if (!isClient && (role === "super_admin" || role === "manager")) push(MANAGE_NAV, "manage");
    if (role === "super_admin") {
      push(SYSTEM_NAV, "system");
      if (!q || "settings".includes(q)) {
        out.push({ key: "system-settings", label: "Settings", href: "/dashboard/settings", icon: Settings, group: "system" });
      }
    }

    return out;
  }, [query, results, isClient, role, base]);

  // Keep the highlight in range as the list changes.
  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(rows.length - 1, 0)));
  }, [rows.length]);

  // Close on outside pointer down.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const showEmpty = open && query.trim().length > 0 && rows.length === 0;
  const showResults = open && (rows.length > 0 || showEmpty);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (rows.length ? (a + 1) % rows.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (rows.length ? (a - 1 + rows.length) % rows.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (showResults) {
        const row = rows[active] ?? rows[0];
        if (row) go(row.href);
      } else if (rows.length > 0) {
        setOpen(true);
      }
    }
  };

  const groupLabels: Record<Row["group"], string> = {
    tickets: "Tickets",
    navigate: isClient ? "Workspace" : "Navigate",
    manage: "Manage",
    system: "System",
  };

  let lastGroup: Row["group"] | null = null;

  return (
    <div ref={wrapRef} className="relative hidden md:block">
      <div role="search" aria-label="Search tickets and navigate" className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={showResults}
          aria-controls="header-search-results"
          aria-autocomplete="list"
          aria-label="Search tickets and navigate"
          value={query}
          placeholder="Search tickets…"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          className="h-9 w-60 rounded-full border border-input/70 bg-muted/40 pl-9 pr-12 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus:border-primary/30 focus:bg-muted/70 focus:outline-none focus:ring-2 focus:ring-primary/20 lg:w-72"
        />
        <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground shadow-sm">
          ⌘K
        </kbd>
      </div>

      {showResults && (
        <div
          id="header-search-results"
          role="listbox"
          aria-label="Search results"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 max-h-[26rem] w-80 overflow-y-auto rounded-xl border border-border bg-popover text-popover-foreground shadow-xl"
        >
          {showEmpty && <p className="px-4 py-6 text-center text-sm text-muted-foreground">No results found.</p>}
          {rows.map((row, i) => {
            const showHeading = row.group !== lastGroup;
            lastGroup = row.group;
            return (
              <div key={row.key}>
                {showHeading && (
                  <p className="px-3 pb-1 pt-3 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-muted-foreground/80">
                    {groupLabels[row.group]}
                  </p>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    go(row.href);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors",
                    i === active ? "bg-primary/10 text-foreground" : "text-foreground/90 hover:bg-muted/60"
                  )}
                >
                  <row.icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  {row.hint && <span className="shrink-0 font-mono text-xs text-muted-foreground">{row.hint}</span>}
                  <span className="truncate">{row.label}</span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
