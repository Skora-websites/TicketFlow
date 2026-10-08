"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Trash2, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useSession } from "next-auth/react";
import { formatDistanceToNow } from "date-fns";

interface NotifItem {
  id: string;
  type: string;
  ticketId: string;
  ticketNumber: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  ticket_assigned: "Assigned",
  status_changed: "Status changed",
  comment_added: "New comment",
};

export function NotificationsContent() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const ticketBaseHref = role === "client" ? "/client/tickets/" : "/dashboard/tickets/";

  const [items, setItems] = useState<NotifItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?all=1", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load notifications");
      const data = await res.json();
      setItems(data.notifications || []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notifications");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const markRead = async (id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    await fetch(`/api/notifications/${id}`, { method: "PATCH" }).catch(() => {});
  };

  const markAllRead = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    await fetch("/api/notifications/read-all", { method: "POST" }).catch(() => {});
  };

  const remove = async (id: string) => {
    setItems((prev) => prev.filter((n) => n.id !== id));
    await fetch(`/api/notifications/${id}`, { method: "DELETE" }).catch(() => {});
  };

  const unreadCount = items.filter((n) => !n.read).length;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="page-header-title">Notifications</h1>
          <p className="page-header-sub">
            {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}` : "You're all caught up."}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead} className="gap-2">
            <CheckCheck className="w-4 h-4" />
            Mark all read
          </Button>
        )}
      </div>

      <Card className="card-elevated">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bell className="w-5 h-5" />
            All Notifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3 animate-pulse">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-muted rounded-lg" />
              ))}
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No notifications yet. You&apos;ll be notified when tickets are assigned to you,
              change status, or receive new comments.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={cn(
                    "flex items-start gap-3 py-3 group",
                    !n.read && "bg-primary/5 -mx-3 px-3 rounded-lg"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`${ticketBaseHref}${n.ticketId}`}
                      onClick={() => !n.read && markRead(n.id)}
                      className="block"
                    >
                      <p className={cn("text-sm font-medium truncate", !n.read && "font-semibold")}>
                        {n.title}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">{n.body}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {n.ticketNumber} · {TYPE_LABELS[n.type] || n.type} ·{" "}
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                        {!n.read && <span className="text-primary font-medium"> · new</span>}
                      </p>
                    </Link>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!n.read && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => markRead(n.id)}
                        aria-label="Mark as read"
                      >
                        <CheckCheck className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => remove(n.id)}
                      aria-label="Delete notification"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
