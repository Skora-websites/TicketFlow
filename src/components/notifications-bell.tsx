"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { formatDistanceToNow } from "date-fns";
import { Bell } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NotifItem {
  id: string;
  ticketId: string;
  ticketNumber: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export function NotificationsBell() {
  const { data: session } = useSession();
  const user = session?.user;

  const [notif, setNotif] = useState<{ unreadCount: number; items: NotifItem[] }>({
    unreadCount: 0,
    items: [],
  });

  const load = async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (data) {
        setNotif({ unreadCount: data.unreadCount ?? 0, items: data.notifications ?? [] });
      }
    } catch {
      /* non-critical: badge simply stays at last known value */
    }
  };

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (active) await load();
    };
    run();
    const interval = setInterval(run, 30000);
    window.addEventListener("focus", run);
    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener("focus", run);
    };
  }, []);

  const markAllRead = async () => {
    try {
      await fetch("/api/notifications/read-all", { method: "POST" });
      setNotif((n) => ({ ...n, unreadCount: 0, items: n.items.map((i) => ({ ...i, read: true })) }));
    } catch {
      /* ignore */
    }
  };

  const markRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}`, { method: "PATCH" });
    } catch {
      /* ignore */
    }
    setNotif((n) => ({
      ...n,
      unreadCount: Math.max(0, n.unreadCount - 1),
      items: n.items.map((i) => (i.id === id ? { ...i, read: true } : i)),
    }));
  };

  const ticketBaseHref = user?.role === "client" ? "/client/tickets/" : "/dashboard/tickets/";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          aria-label={notif.unreadCount > 0 ? `Notifications, ${notif.unreadCount} unread` : "Notifications"}
        >
          <Bell className="h-4 w-4" aria-hidden />
          {notif.unreadCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-white ring-2 ring-background"
              aria-hidden
            >
              {notif.unreadCount > 9 ? "9+" : notif.unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-84 rounded-xl border-border/70 shadow-lg" align="end">
        <div className="flex items-center justify-between px-2 py-1">
          <DropdownMenuLabel className="px-0 font-semibold">Notifications</DropdownMenuLabel>
          {notif.unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="text-xs font-medium text-primary hover:underline"
            >
              Mark all read
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        {notif.items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
            <Bell className="h-6 w-6 text-muted-foreground/40" aria-hidden />
            <p className="text-sm text-muted-foreground">You&apos;re all caught up.</p>
          </div>
        ) : (
          notif.items.map((item) => (
            <DropdownMenuItem key={item.id} asChild>
              <Link
                href={`${ticketBaseHref}${item.ticketId}`}
                onClick={() => markRead(item.id)}
                className="flex items-start gap-2.5 rounded-lg"
              >
                {/* Unread dot */}
                <span
                  className={cn(
                    "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                    item.read ? "bg-transparent" : "bg-primary"
                  )}
                  aria-hidden
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span
                    className={`truncate text-sm ${
                      item.read ? "font-normal text-muted-foreground" : "font-medium text-foreground"
                    }`}
                  >
                    {item.title}
                  </span>
                  <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                    {item.ticketNumber}
                    <span aria-hidden>·</span>
                    <span className="font-sans">{formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}</span>
                  </span>
                </span>
              </Link>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard/notifications" className="text-center text-sm font-medium text-primary">
            View all notifications
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
