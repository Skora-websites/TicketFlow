"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
import { useToast } from "@/components/ui/toast";
import {
  ExternalLink,
  CheckCheck,
  MailCheck,
  CircleDot,
  Copy,
  Link2,
  Trash2,
  EyeOff,
  Bell,
} from "lucide-react";

export interface NotificationContextMenuProps {
  notification: {
    id: string;
    ticketId?: string;
    ticketNumber?: string;
    title: string;
    body: string;
    read: boolean;
    createdAt?: string | Date;
    type?: string;
  };
  userRole?: string;
  onOpen?: () => void;
  onToggleRead?: (id: string, newRead: boolean) => Promise<void> | void;
  onDismiss?: (id: string) => Promise<void> | void;
  onDelete?: (id: string) => Promise<void> | void;
  disabled?: boolean;
  children: React.ReactNode;
}

export function NotificationContextMenu({
  notification,
  userRole,
  onOpen,
  onToggleRead,
  onDismiss,
  onDelete,
  disabled = false,
  children,
}: NotificationContextMenuProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const ticketPath =
    userRole === "client" ? "/client/tickets/" : "/dashboard/tickets/";
  const ticketHref = notification.ticketId
    ? `${ticketPath}${notification.ticketId}`
    : undefined;

  const handleOpen = () => {
    if (onOpen) {
      onOpen();
    } else if (ticketHref) {
      router.push(ticketHref);
    }
  };

  const handleToggleRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const newRead = !notification.read;
    if (onToggleRead) {
      await onToggleRead(notification.id, newRead);
    } else {
      // Default fallback mutation
      try {
        const res = await fetch(`/api/notifications/${notification.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ read: newRead }),
        });
        if (!res.ok) throw new Error();
        window.dispatchEvent(
          new CustomEvent(
            newRead
              ? "ticketflow:notification-read"
              : "ticketflow:notification-unread",
            { detail: { id: notification.id } }
          )
        );
      } catch {
        toast({
          title: "Failed to update notification",
          description: "Could not change read status. Please try again.",
          variant: "destructive",
        });
      }
    }
    toast({
      title: newRead ? "Marked as read" : "Marked as unread",
      description: notification.title,
    });
  };

  const handleCopyLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!ticketHref) return;
    try {
      const fullUrl = `${window.location.origin}${ticketHref}`;
      await navigator.clipboard.writeText(fullUrl);
      toast({
        title: "Link copied",
        description: "Ticket link copied to clipboard.",
      });
    } catch {
      toast({
        title: "Failed to copy link",
        variant: "destructive",
      });
    }
  };

  const handleCopyDetails = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const text = `${notification.title}${
        notification.ticketNumber ? ` [${notification.ticketNumber}]` : ""
      }\n${notification.body}`;
      await navigator.clipboard.writeText(text);
      toast({
        title: "Details copied",
        description: "Notification content copied to clipboard.",
      });
    } catch {
      toast({
        title: "Failed to copy",
        variant: "destructive",
      });
    }
  };

  const handleDismiss = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDismiss) {
      await onDismiss(notification.id);
    } else if (onDelete) {
      await onDelete(notification.id);
    } else {
      // Default dismissal
      try {
        const res = await fetch(`/api/notifications/${notification.id}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error();
        window.dispatchEvent(
          new CustomEvent("ticketflow:notification-removed", {
            detail: { id: notification.id },
          })
        );
      } catch {
        toast({
          title: "Failed to dismiss notification",
          variant: "destructive",
        });
      }
    }
    toast({
      title: "Notification dismissed",
      description: notification.title,
    });
  };

  const confirmDelete = async () => {
    setIsDeleting(true);
    try {
      if (onDelete) {
        await onDelete(notification.id);
      } else {
        const res = await fetch(`/api/notifications/${notification.id}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error();
        window.dispatchEvent(
          new CustomEvent("ticketflow:notification-removed", {
            detail: { id: notification.id },
          })
        );
      }
      toast({
        title: "Notification deleted",
        description: notification.title,
      });
    } catch {
      toast({
        title: "Failed to delete notification",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (disabled) {
    return <>{children}</>;
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent className="w-56 rounded-xl border-border bg-popover/95 p-1.5 shadow-xl backdrop-blur-md">
          <ContextMenuLabel className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
            <span className="truncate max-w-[130px]">
              {notification.ticketNumber || "Notification"}
            </span>
            <span
              className={`h-2 w-2 rounded-full ${
                notification.read ? "bg-muted-foreground/30" : "bg-primary animate-pulse"
              }`}
            />
          </ContextMenuLabel>
          <ContextMenuSeparator />

          {/* Primary Open Action */}
          {ticketHref && (
            <ContextMenuItem
              onClick={handleOpen}
              className="gap-2 text-xs font-medium cursor-pointer"
            >
              <ExternalLink className="h-3.5 w-3.5 text-primary" />
              <span>Open Related Ticket</span>
            </ContextMenuItem>
          )}

          {/* Mark as read / unread toggle */}
          <ContextMenuItem
            onClick={handleToggleRead}
            className="gap-2 text-xs font-medium cursor-pointer"
          >
            {notification.read ? (
              <>
                <CircleDot className="h-3.5 w-3.5 text-primary" />
                <span>Mark as Unread</span>
              </>
            ) : (
              <>
                <CheckCheck className="h-3.5 w-3.5 text-emerald-500" />
                <span>Mark as Read</span>
              </>
            )}
          </ContextMenuItem>

          <ContextMenuSeparator />

          {/* Copy Ticket Link */}
          {ticketHref && (
            <ContextMenuItem
              onClick={handleCopyLink}
              className="gap-2 text-xs font-medium cursor-pointer"
            >
              <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Copy Ticket Link</span>
            </ContextMenuItem>
          )}

          {/* Copy Notification Details */}
          <ContextMenuItem
            onClick={handleCopyDetails}
            className="gap-2 text-xs font-medium cursor-pointer"
          >
            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Copy Notification Text</span>
          </ContextMenuItem>

          <ContextMenuSeparator />

          {/* Dismiss notification */}
          <ContextMenuItem
            onClick={handleDismiss}
            className="gap-2 text-xs font-medium cursor-pointer"
          >
            <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Dismiss Notification</span>
          </ContextMenuItem>

          {/* Delete notification */}
          <ContextMenuItem
            onClick={() => setShowDeleteConfirm(true)}
            className="gap-2 text-xs font-medium text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Delete Notification</span>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={showDeleteConfirm}
        onOpenChange={(open) => !isDeleting && setShowDeleteConfirm(open)}
      >
        <AlertDialogContent className="max-w-md rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-base font-semibold text-destructive">
              <Trash2 className="h-5 w-5" />
              Delete Notification
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground">
              Are you sure you want to permanently delete this notification? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-xl border border-border/80 bg-muted/40 p-3 text-xs">
            <p className="font-semibold text-foreground truncate">{notification.title}</p>
            <p className="text-muted-foreground line-clamp-2 mt-0.5">{notification.body}</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
