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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
        "group relative flex h-8.5 items-center gap-2.5 rounded-lg px-2.5 text-xs font-medium transition-all duration-150",
        active
          ? "bg-sidebar-accent text-sidebar-primary font-semibold border border-sidebar-primary/30 shadow-xs"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
      )}
    >
      <Icon
        className={cn(
          "h-3.5 w-3.5 shrink-0 transition-colors",
          active ? "text-sidebar-primary" : "text-sidebar-foreground/55 group-hover:text-sidebar-foreground"
        )}
        aria-hidden
      />
      <span className="truncate">{item.name}</span>
      {showQueuePill && unassigned !== null && unassigned > 0 && (
        <span
          className={cn(
            "ml-auto inline-flex items-center gap-1 rounded-full px-1.5 py-0.2 text-[10px] font-bold tabular-nums",
            active
              ? "bg-sidebar-primary text-sidebar-primary-foreground"
              : "bg-sidebar-accent text-sidebar-primary border border-sidebar-border"
          )}
          aria-label={`${unassigned} unassigned tickets waiting`}
        >
          {unassigned}
        </span>
      )}
    </Link>
  );
}

function NavGroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pt-4 pb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-sidebar-foreground/45 first:pt-1">
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
    <Link href={href} className="group flex items-center gap-2.5 transition-opacity hover:opacity-90">
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sidebar-primary font-display text-sm font-bold text-sidebar-primary-foreground shadow-xs" aria-hidden>
        T
      </div>
      <span className="font-display text-[1.0625rem] font-bold tracking-tight text-sidebar-foreground">
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
    <div className="space-y-2 border-t border-sidebar-border p-2.5">
      {!isClient && (
        <Link
          href="/dashboard/tickets/new"
          className="flex h-8.5 items-center justify-center gap-2 rounded-lg bg-sidebar-primary px-3 text-xs font-semibold text-sidebar-primary-foreground shadow-sm transition-all hover:opacity-90 active:scale-[0.98]"
        >
          <TicketPlus className="h-3.5 w-3.5" aria-hidden />
          New Ticket
        </Link>
      )}

      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-full justify-start gap-2 rounded-lg text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        onClick={() => signOut({ callbackUrl: "/login" })}
      >
        <LogOut className="h-3.5 w-3.5" aria-hidden />
        Log Out
      </Button>

      {user && (
        <div className="flex items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-2">
          <Avatar className="h-7 w-7 border border-sidebar-border">
            <AvatarImage src={user.image || ""} alt={user.name || ""} />
            <AvatarFallback className="bg-sidebar-accent text-[11px] font-bold text-sidebar-primary">
              {user.name?.charAt(0).toUpperCase() || "A"}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-sidebar-foreground leading-tight">{user.name}</p>
            <p className="truncate text-[10px] text-sidebar-foreground/50 capitalize mt-0.5">
              {user.role === "super_admin" ? "Administrator" : user.role?.replace("_", " ")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const { data: session } = useSession();
  const isClient = session?.user?.role === "client";

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[215px] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
      <div className="flex h-12 items-center border-b border-sidebar-border px-4">
        <BrandMark href={isClient ? "/client/tickets" : "/dashboard/overview"} />
      </div>
      <div className="flex-1 overflow-y-auto p-2">
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

  useEffect(() => {
    const handleToggle = () => setOpen((prev) => !prev);
    window.addEventListener("toggle-mobile-sidebar", handleToggle);
    return () => window.removeEventListener("toggle-mobile-sidebar", handleToggle);
  }, []);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="flex w-72 flex-col p-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <div className="flex h-12 items-center border-b border-sidebar-border px-4">
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
