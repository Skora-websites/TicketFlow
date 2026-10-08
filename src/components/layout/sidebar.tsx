"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  TicketCheck,
  Users,
  Settings,
  BarChart3,
  FolderKanban,
  Inbox,
  Gauge,
  TicketPlus,
  LogOut,
  Building2,
  Cpu,
  Send,
  Tags,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import { signOut, useSession } from "next-auth/react";
import { Menu } from "lucide-react";

// Agents (role=team) get My Tickets + Sent only — no All Tickets view.
// Managers/super admins additionally see All Tickets + the unassigned queue.
const workspaceNavigation = [
  { name: "Overview", href: "/dashboard/overview", icon: LayoutDashboard, roles: ["super_admin", "manager", "team"] },
  { name: "My Tickets", href: "/dashboard/tickets?view=mine", icon: TicketCheck, roles: ["super_admin", "manager", "team"] },
  { name: "Sent Tickets", href: "/dashboard/tickets?view=sent", icon: Send, roles: ["super_admin", "manager", "team"] },
  { name: "All Tickets", href: "/dashboard/tickets", icon: FolderKanban, roles: ["super_admin", "manager"] },
];

const manageNavigation = [
  { name: "Unassigned Queue", href: "/dashboard/queue", icon: Inbox, roles: ["super_admin", "manager"] },
  { name: "Team Workload", href: "/dashboard/workload", icon: Gauge, roles: ["super_admin", "manager"] },
  { name: "Analytics", href: "/dashboard/analytics", icon: BarChart3, roles: ["super_admin", "manager"] },
  { name: "Routing", href: "/dashboard/routing", icon: Cpu, roles: ["super_admin", "manager"] },
  { name: "Users", href: "/dashboard/users", icon: Users, roles: ["super_admin", "manager"] },
];

const systemNavigation = [
  { name: "Departments", href: "/dashboard/departments", icon: Building2, roles: ["super_admin"] },
  { name: "Categories", href: "/dashboard/categories", icon: Tags, roles: ["super_admin"] },
  { name: "Settings", href: "/dashboard/settings", icon: Settings, roles: ["super_admin", "manager", "team"] },
];

const clientNavigation = [
  { name: "My Tickets", href: "/client/tickets", icon: TicketCheck },
  { name: "Create Ticket", href: "/client/tickets/new", icon: TicketPlus },
];

function useActivePath() {
  // useSearchParams is SSR-compatible: the active state renders correctly on
  // the server response, no post-hydration flash.
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return { pathname, search: searchParams.toString() ? `?${searchParams.toString()}` : "" };
}

/** Live unassigned-ticket count for the queue pill. Managers only. */
function useUnassignedCount(enabled: boolean) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/stats");
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setCount(data?.overview?.unassigned ?? 0);
        }
      } catch {
        // keep last known count
      }
    };
    load();
    const id = setInterval(load, 60_000);
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("focus", load);
    };
  }, [enabled]);
  return count;
}

function isActive(href: string, pathname: string, search: string) {
  const [base, query] = href.split("?");
  if (pathname !== base) return false;
  const hrefView = new URLSearchParams(query || "").get("view");
  const currentView = new URLSearchParams(search).get("view");
  if (hrefView) return currentView === hrefView;
  return !currentView;
}

function NavLink({
  item,
  pathname,
  search,
  onNavigate,
}: {
  item: { name: string; href: string; icon: any };
  pathname: string;
  search: string;
  onNavigate?: () => void;
}) {
  const active = isActive(item.href, pathname, search);
  const Icon = item.icon;
  const showQueuePill = item.href === "/dashboard/queue";
  const unassigned = useUnassignedCount(showQueuePill);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-primary/10 text-primary before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-6 before:w-[2px] before:bg-primary before:rounded-r"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {item.name}
      {showQueuePill && unassigned !== null && unassigned > 0 && (
        <span
          className="ml-auto inline-flex items-center gap-1 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-destructive"
          aria-label={`${unassigned} unassigned tickets waiting`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-destructive" aria-hidden />
          {unassigned}
        </span>
      )}
    </Link>
  );
}

function NavGroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pt-4 pb-1 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70 first:pt-0">
      {children}
    </p>
  );
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname, search } = useActivePath();
  const { data: session } = useSession();
  const role = session?.user?.role;
  const isClient = role === "client";

  if (isClient) {
    return (
      <nav className="space-y-1" aria-label="Client navigation">
        {clientNavigation.map((item) => (
          <NavLink key={item.name} item={item} pathname={pathname} search={search} onNavigate={onNavigate} />
        ))}
      </nav>
    );
  }

  const workspace = workspaceNavigation.filter((n) => n.roles?.includes(role ?? ""));
  const manage = manageNavigation.filter((n) => n.roles?.includes(role ?? ""));
  const system = systemNavigation.filter((n) => n.roles?.includes(role ?? ""));

  return (
    <nav className="space-y-1" aria-label="Dashboard navigation">
      <NavGroupLabel>Workspace</NavGroupLabel>
      {workspace.map((item) => (
        <NavLink key={item.name} item={item} pathname={pathname} search={search} onNavigate={onNavigate} />
      ))}
      {manage.length > 0 && (
        <>
          <NavGroupLabel>Manage</NavGroupLabel>
          {manage.map((item) => (
            <NavLink key={item.name} item={item} pathname={pathname} search={search} onNavigate={onNavigate} />
          ))}
        </>
      )}
      {system.length > 0 && (
        <>
          <NavGroupLabel>System</NavGroupLabel>
          {system.map((item) => (
            <NavLink key={item.name} item={item} pathname={pathname} search={search} onNavigate={onNavigate} />
          ))}
        </>
      )}
    </nav>
  );
}

function BrandMark({ href }: { href: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5">
      <span
        className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary font-display text-sm font-bold text-primary-foreground"
        aria-hidden
      >
        T
      </span>
      <span className="font-display text-[1.0625rem] font-bold tracking-tight text-foreground">
        TicketFlow
      </span>
    </Link>
  );
}

function SidebarFooter() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const isClient = role === "client";
  const user = session?.user;

  return (
    <div className="space-y-3 border-t border-border p-4">
      {!isClient && (
        <Link
          href="/dashboard/tickets/new"
          className="flex items-center gap-2.5 rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <TicketPlus className="h-4 w-4" aria-hidden />
          New Ticket
        </Link>
      )}
      {user && (
        <div className="flex items-center gap-2.5 rounded-lg px-1 py-1">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
              {user.name?.charAt(0).toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
            <Badge variant="secondary" className="mt-0.5 text-[11px] capitalize">
              {user.role?.replace("_", " ")}
            </Badge>
          </div>
        </div>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start gap-2.5 text-muted-foreground hover:text-foreground"
        onClick={() => signOut({ callbackUrl: "/login" })}
      >
        <LogOut className="h-4 w-4" aria-hidden />
        Sign Out
      </Button>
    </div>
  );
}

export function Sidebar() {
  const { data: session } = useSession();
  const isClient = session?.user?.role === "client";

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border bg-sidebar text-sidebar-foreground lg:flex">
      <div className="flex h-16 items-center border-b border-border px-4">
        <BrandMark href={isClient ? "/client/tickets" : "/dashboard/overview"} />
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <SidebarNav />
      </div>
      <SidebarFooter />
    </aside>
  );
}

export function MobileSidebar() {
  const [open, setOpen] = useState(false);
  const { data: session } = useSession();
  const isClient = session?.user?.role === "client";

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="flex w-72 flex-col p-0">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <div className="flex h-16 items-center border-b border-border px-4">
          <BrandMark href={isClient ? "/client/tickets" : "/dashboard/overview"} />
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <SidebarNav onNavigate={() => setOpen(false)} />
        </div>
        <SidebarFooter />
      </SheetContent>
    </Sheet>
  );
}
