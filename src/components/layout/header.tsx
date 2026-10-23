"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Moon, Sun, User, LogOut } from "lucide-react";
import { useTheme } from "next-themes";
import { useSession, signOut } from "next-auth/react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { NotificationsBell } from "@/components/notifications-bell";
import { MobileSidebar } from "./sidebar";
import { HeaderSearch } from "./HeaderSearch";

const segmentLabels: Record<string, string> = {
  dashboard: "Dashboard",
  client: "Workspace",
  overview: "Overview",
  tickets: "Tickets",
  new: "New",
  queue: "Unassigned Queue",
  workload: "Team Workload",
  analytics: "Analytics",
  routing: "Routing",
  users: "Users",
  departments: "Departments",
  settings: "Settings",
  notifications: "Notifications",
};

function Breadcrumbs({ pathname }: { pathname: string }) {
  const segments = pathname.split("/").filter(Boolean);
  // Drop dynamic [id] values from display; show "Detail" instead.
  const crumbs = segments.map((seg, i) => {
    const isId = seg.length > 12 || /^[0-9a-f]{20,}$/i.test(seg);
    const label = isId ? "Detail" : (segmentLabels[seg] ?? seg.replace(/_/g, " "));
    const href = "/" + segments.slice(0, i + 1).join("/");
    const isLast = i === segments.length - 1;
    // Never link dynamic ids.
    const linkable = !isLast && !isId;
    return { label, href, isLast, linkable, key: `${seg}-${i}` };
  });

  if (crumbs.length === 0) return null;

  // Flat list on purpose: React.Fragment can't be used here because the
  // dev component tagger injects props Fragments don't accept.
  const nodes: React.ReactNode[] = [];
  crumbs.forEach((c, i) => {
    if (i > 0) nodes.push(<BreadcrumbSeparator key={`sep-${c.key}`} />);
    nodes.push(
      <BreadcrumbItem key={`crumb-${c.key}`}>
        {c.isLast ? (
          <BreadcrumbPage>{c.label}</BreadcrumbPage>
        ) : c.linkable ? (
          <BreadcrumbLink asChild>
            <Link href={c.href}>{c.label}</Link>
          </BreadcrumbLink>
        ) : (
          <span className="text-muted-foreground">{c.label}</span>
        )}
      </BreadcrumbItem>
    );
  });

  return (
    <Breadcrumb aria-label="Page breadcrumb">
      <BreadcrumbList>{nodes}</BreadcrumbList>
    </Breadcrumb>
  );
}

/**
 * Segmented light/dark switch. Renders both options so the active state is
 * obvious (a lone icon button gave no hint a theme had two values). Resolves
 * after mount to avoid a hydration mismatch with next-themes' injected class.
 */
function ThemeToggle({
  theme,
  setTheme,
}: {
  theme: string | undefined;
  setTheme: (t: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const active = mounted ? theme : undefined; // undefined = render neutral
  const base =
    "flex h-6 w-6 items-center justify-center rounded-full transition-colors";
  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className="flex items-center rounded-md bg-secondary p-0.5 border border-border"
    >
      <button
        type="button"
        role="radio"
        aria-checked={active === "light"}
        aria-label="Light theme"
        onClick={() => setTheme("light")}
        className={cn(
          base,
          active === "light"
            ? "bg-card text-foreground shadow-xs"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Sun className="h-3 w-3" aria-hidden />
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={active === "dark"}
        aria-label="Dark theme"
        onClick={() => setTheme("dark")}
        className={cn(
          base,
          active === "dark"
            ? "bg-card text-foreground shadow-xs"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Moon className="h-3 w-3" aria-hidden />
      </button>
    </div>
  );
}

export function Header() {
  const { data: session } = useSession();
  const { resolvedTheme, setTheme } = useTheme();
  const user = session?.user;
  const pathname = usePathname();
  const isClient = user?.role === "client";

  return (
    <header className="sticky top-0 z-30 h-12 w-full border-b border-border bg-card">
      <div className="flex h-full items-center gap-3 px-4 sm:gap-4 sm:px-6">
        <MobileSidebar />
        <div className="min-w-0 flex-1">
          <Breadcrumbs pathname={pathname} />
        </div>

        <HeaderSearch />

        <div className="hidden items-center gap-1.5 font-medium text-xs text-muted-foreground lg:flex">
          <span>{format(new Date(), "EEEE, MMMM d")}</span>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle theme={resolvedTheme} setTheme={setTheme} />

          <NotificationsBell />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="rounded-full outline-none ring-primary/20 transition-all focus-visible:ring-2"
                aria-label="Open user menu"
              >
                <Avatar className="h-7 w-7 border border-border">
                  <AvatarImage src={user?.image || ""} alt={user?.name || ""} />
                  <AvatarFallback className="bg-secondary text-[11px] font-medium text-foreground">
                    {user?.name?.charAt(0).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="font-medium">{user?.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                  <Badge variant="secondary" className="mt-1 w-fit capitalize">
                    {user?.role?.replace("_", " ")}
                  </Badge>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href={isClient ? "/client/tickets" : "/dashboard/settings"} className="flex w-full items-center gap-2">
                  <User className="h-4 w-4" />
                  Profile & Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => {
                  document.cookie = "rm=; path=/; max-age=0; samesite=lax";
                  signOut({ callbackUrl: "/login" });
                }}
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
