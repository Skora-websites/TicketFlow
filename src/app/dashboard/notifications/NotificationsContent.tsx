"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Bell,
  Trash2,
  CheckCheck,
  CircleDot,
  CheckSquare,
  Square,
  X,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useSession } from "next-auth/react";
import { formatDistanceToNow } from "date-fns";
import { NotificationContextMenu } from "@/components/productivity/NotificationContextMenu";
import { useToast } from "@/components/ui/toast";

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
  const { toast } = useToast();
  const role = session?.user?.role;
  const ticketBaseHref = role === "client" ? "/client/tickets/" : "/dashboard/tickets/";

  const [items, setItems] = useState<NotifItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const [isBulkOperating, setIsBulkOperating] = useState(false);

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

    const onReadAll = () => {
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    };
    const onReadSingle = (e: Event) => {
      const targetId = (e as CustomEvent<{ id: string }>).detail?.id;
      if (targetId) {
        setItems((prev) => prev.map((n) => (n.id === targetId ? { ...n, read: true } : n)));
      }
    };
    const onUnreadSingle = (e: Event) => {
      const targetId = (e as CustomEvent<{ id: string }>).detail?.id;
      if (targetId) {
        setItems((prev) => prev.map((n) => (n.id === targetId ? { ...n, read: false } : n)));
      }
    };
    const onRemoved = (e: Event) => {
      const targetId = (e as CustomEvent<{ id: string }>).detail?.id;
      if (targetId) {
        setItems((prev) => prev.filter((n) => n.id !== targetId));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(targetId);
          return next;
        });
      }
    };

    window.addEventListener("ticketflow:notifications-read-all", onReadAll);
    window.addEventListener("ticketflow:notification-read", onReadSingle);
    window.addEventListener("ticketflow:notification-unread", onUnreadSingle);
    window.addEventListener("ticketflow:notification-removed", onRemoved);

    return () => {
      window.removeEventListener("ticketflow:notifications-read-all", onReadAll);
      window.removeEventListener("ticketflow:notification-read", onReadSingle);
      window.removeEventListener("ticketflow:notification-unread", onUnreadSingle);
      window.removeEventListener("ticketflow:notification-removed", onRemoved);
    };
  }, [load]);

  const toggleRead = async (id: string, newRead: boolean) => {
    const prev = items;
    setItems((current) => current.map((n) => (n.id === id ? { ...n, read: newRead } : n)));
    window.dispatchEvent(
      new CustomEvent(
        newRead ? "ticketflow:notification-read" : "ticketflow:notification-unread",
        { detail: { id } }
      )
    );
    try {
      const res = await fetch(`/api/notifications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: newRead }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setItems(prev);
      toast({
        title: "Update failed",
        description: "Could not update notification read status.",
        variant: "destructive",
      });
    }
  };

  const markAllRead = async () => {
    const prev = items;
    setItems((current) => current.map((n) => ({ ...n, read: true })));
    window.dispatchEvent(new CustomEvent("ticketflow:notifications-read-all"));
    try {
      const res = await fetch("/api/notifications/read-all", { method: "POST" });
      if (!res.ok) throw new Error();
      toast({
        title: "All marked as read",
        description: "All unread notifications have been marked as read.",
      });
    } catch {
      setItems(prev);
      toast({
        title: "Failed to mark all as read",
        variant: "destructive",
      });
    }
  };

  const remove = async (id: string) => {
    const prev = items;
    setItems((current) => current.filter((n) => n.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    window.dispatchEvent(new CustomEvent("ticketflow:notification-removed", { detail: { id } }));
    try {
      const res = await fetch(`/api/notifications/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setItems(prev);
      toast({
        title: "Failed to delete notification",
        variant: "destructive",
      });
    }
  };

  // Bulk actions handlers
  const toggleSelectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((i) => i.id)));
    }
  };

  const toggleSelectOne = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleBulkToggleRead = async (targetRead: boolean) => {
    const idsToUpdate = Array.from(selectedIds);
    if (idsToUpdate.length === 0) return;

    const prev = items;
    setItems((current) =>
      current.map((n) => (selectedIds.has(n.id) ? { ...n, read: targetRead } : n))
    );

    // Notify listeners for each item optimistically
    idsToUpdate.forEach((id) => {
      window.dispatchEvent(
        new CustomEvent(
          targetRead ? "ticketflow:notification-read" : "ticketflow:notification-unread",
          { detail: { id } }
        )
      );
    });

    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: idsToUpdate, read: targetRead }),
      });
      if (!res.ok) throw new Error();
      toast({
        title: targetRead ? "Marked selected as read" : "Marked selected as unread",
        description: `${idsToUpdate.length} notification${idsToUpdate.length === 1 ? "" : "s"} updated.`,
      });
      setSelectedIds(new Set());
    } catch {
      setItems(prev);
      toast({
        title: "Bulk update failed",
        description: "Failed to update selected notifications.",
        variant: "destructive",
      });
    }
  };

  const handleBulkDelete = async () => {
    const idsToDelete = Array.from(selectedIds);
    if (idsToDelete.length === 0) return;

    setIsBulkOperating(true);
    const prev = items;
    setItems((current) => current.filter((n) => !selectedIds.has(n.id)));

    // Emit removed event for each item
    idsToDelete.forEach((id) => {
      window.dispatchEvent(
        new CustomEvent("ticketflow:notification-removed", { detail: { id } })
      );
    });

    try {
      const res = await fetch("/api/notifications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: idsToDelete }),
      });
      if (!res.ok) throw new Error();
      toast({
        title: "Notifications deleted",
        description: `Successfully removed ${idsToDelete.length} notification${idsToDelete.length === 1 ? "" : "s"}.`,
      });
      setSelectedIds(new Set());
    } catch {
      setItems(prev);
      toast({
        title: "Delete failed",
        description: "Could not delete selected notifications.",
        variant: "destructive",
      });
    } finally {
      setIsBulkOperating(false);
      setShowBulkDeleteConfirm(false);
    }
  };

  const handleClearAll = async () => {
    setIsBulkOperating(true);
    const prev = items;
    setItems([]);
    setSelectedIds(new Set());

    prev.forEach((item) => {
      window.dispatchEvent(
        new CustomEvent("ticketflow:notification-removed", { detail: { id: item.id } })
      );
    });

    try {
      const res = await fetch("/api/notifications?all=1", {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      toast({
        title: "Notifications cleared",
        description: "All notifications have been cleared.",
      });
    } catch {
      setItems(prev);
      toast({
        title: "Clear all failed",
        variant: "destructive",
      });
    } finally {
      setIsBulkOperating(false);
      setShowClearAllConfirm(false);
    }
  };

  const unreadCount = items.filter((n) => !n.read).length;
  const isAllSelected = items.length > 0 && selectedIds.size === items.length;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="page-header-title">Notifications</h1>
          <p className="page-header-sub">
            {unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
              : "You're all caught up."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {items.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowClearAllConfirm(true)}
              className="gap-1.5 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear all
            </Button>
          )}
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={markAllRead} className="gap-2">
              <CheckCheck className="w-4 h-4" />
              Mark all read
            </Button>
          )}
        </div>
      </div>

      {/* Bulk action toolbar when items are selected */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs shadow-xs animate-in fade-in-0 duration-200">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {selectedIds.size}
            </span>
            <span>selected of {items.length}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBulkToggleRead(true)}
              className="h-8 gap-1.5 text-xs"
            >
              <CheckCheck className="w-3.5 h-3.5 text-emerald-500" />
              Mark as read
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBulkToggleRead(false)}
              className="h-8 gap-1.5 text-xs"
            >
              <CircleDot className="w-3.5 h-3.5 text-primary" />
              Mark as unread
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowBulkDeleteConfirm(true)}
              className="h-8 gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete selected
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              onClick={() => setSelectedIds(new Set())}
              aria-label="Cancel selection"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      <Card className="card-elevated">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Bell className="w-4 h-4 text-primary" />
            All Notifications
          </CardTitle>
          {items.length > 0 && (
            <button
              type="button"
              onClick={toggleSelectAll}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer select-none"
            >
              {isAllSelected ? (
                <CheckSquare className="w-4 h-4 text-primary" />
              ) : (
                <Square className="w-4 h-4" />
              )}
              <span>{isAllSelected ? "Deselect all" : "Select all"}</span>
            </button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading && items.length === 0 ? (
            <ul className="divide-y divide-border" aria-label="Loading notifications" aria-busy="true">
              {[1, 2, 3, 4].map((i) => (
                <li key={i} className="flex items-start gap-3 py-3">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <Skeleton className="h-4 w-1/3 rounded" />
                    <Skeleton className="h-3.5 w-3/4 rounded" />
                    <Skeleton className="h-3 w-48 rounded" />
                  </div>
                  <Skeleton className="h-8 w-8 rounded-lg" />
                </li>
              ))}
            </ul>
          ) : error ? (
            <div className="py-6 text-center">
              <p className="text-sm text-destructive mb-3">{error}</p>
              <Button variant="outline" size="sm" onClick={() => load()}>
                Retry
              </Button>
            </div>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No notifications yet. You&apos;ll be notified when tickets are assigned to you,
              change status, or receive new comments.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => {
                const isSelected = selectedIds.has(n.id);
                return (
                  <NotificationContextMenu
                    key={n.id}
                    notification={n}
                    userRole={role}
                    onToggleRead={toggleRead}
                    onDismiss={remove}
                    onDelete={remove}
                  >
                    <li
                      className={cn(
                        "flex items-start gap-3 py-3 px-2 rounded-lg transition-colors group cursor-pointer",
                        !n.read && "bg-primary/5",
                        isSelected && "bg-primary/10 ring-1 ring-primary/20"
                      )}
                      onClick={(e) => {
                        // Allow clicking anywhere when selecting
                        if (selectedIds.size > 0) {
                          toggleSelectOne(n.id, e);
                        }
                      }}
                    >
                      {/* Checkbox for selection */}
                      <div
                        className="pt-1"
                        onClick={(e) => toggleSelectOne(n.id, e)}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => {}}
                          aria-label={`Select notification ${n.ticketNumber}`}
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <Link
                          href={`${ticketBaseHref}${n.ticketId}`}
                          onClick={(e) => {
                            if (selectedIds.size > 0) {
                              e.preventDefault();
                              toggleSelectOne(n.id, e);
                              return;
                            }
                            if (!n.read) toggleRead(n.id, true);
                          }}
                          className="block"
                        >
                          <p
                            className={cn(
                              "text-sm font-medium truncate",
                              !n.read && "font-semibold text-foreground"
                            )}
                          >
                            {n.title}
                          </p>
                          <p className="text-sm text-muted-foreground truncate">{n.body}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {n.ticketNumber} · {TYPE_LABELS[n.type] || n.type} ·{" "}
                            {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                            {!n.read && (
                              <span className="text-primary font-medium"> · new</span>
                            )}
                          </p>
                        </Link>
                      </div>

                      {/* Quick Hover Actions */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleRead(n.id, !n.read);
                          }}
                          aria-label={n.read ? "Mark as unread" : "Mark as read"}
                          title={n.read ? "Mark as unread" : "Mark as read"}
                        >
                          {n.read ? (
                            <CircleDot className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <CheckCheck className="w-4 h-4 text-emerald-500" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            remove(n.id);
                          }}
                          aria-label="Delete notification"
                          title="Delete notification"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </li>
                  </NotificationContextMenu>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog
        open={showBulkDeleteConfirm}
        onOpenChange={(open) => !isBulkOperating && setShowBulkDeleteConfirm(open)}
      >
        <AlertDialogContent className="max-w-md rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-base font-semibold text-destructive">
              <Trash2 className="h-5 w-5" />
              Delete {selectedIds.size} Selected Notifications
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground">
              Are you sure you want to permanently delete {selectedIds.size} selected notifications? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkOperating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isBulkOperating}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isBulkOperating ? "Deleting..." : "Delete All Selected"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear All Confirmation Dialog */}
      <AlertDialog
        open={showClearAllConfirm}
        onOpenChange={(open) => !isBulkOperating && setShowClearAllConfirm(open)}
      >
        <AlertDialogContent className="max-w-md rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-base font-semibold text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Clear All Notifications
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground">
              Are you sure you want to clear all {items.length} notifications? All historical alerts will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkOperating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearAll}
              disabled={isBulkOperating}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isBulkOperating ? "Clearing..." : "Clear All"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
