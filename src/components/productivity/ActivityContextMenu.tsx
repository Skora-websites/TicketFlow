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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import {
  ExternalLink,
  User,
  Copy,
  Link2,
  Info,
  ShieldAlert,
  Clock,
  Ticket,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

export interface ActivityContextMenuProps {
  activity: {
    id?: string;
    ticketId?: string;
    ticketNumber?: string;
    ticketTitle?: string;
    action?: string;
    details?: string;
    user?:
      | {
          _id?: string;
          name?: string;
          email?: string;
          role?: string;
        }
      | string;
    timestamp?: string | Date;
    type?: string;
  };
  userRole?: string;
  onOpenTicket?: () => void;
  onViewUser?: () => void;
  onViewDetails?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}

export function ActivityContextMenu({
  activity,
  userRole,
  onOpenTicket,
  onViewUser,
  onViewDetails,
  disabled = false,
  children,
}: ActivityContextMenuProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);

  const ticketPath =
    userRole === "client" ? "/client/tickets/" : "/dashboard/tickets/";
  const ticketHref = activity.ticketId
    ? `${ticketPath}${activity.ticketId}`
    : undefined;

  const userName =
    typeof activity.user === "object"
      ? activity.user?.name || activity.user?.email || "System"
      : activity.user || "System";

  const userEmail =
    typeof activity.user === "object" ? activity.user?.email : undefined;

  const activityText =
    activity.details ||
    activity.action ||
    activity.ticketTitle ||
    "Activity Event";

  const dateObj = activity.timestamp ? new Date(activity.timestamp) : new Date();

  const handleOpenTicket = () => {
    if (onOpenTicket) {
      onOpenTicket();
    } else if (ticketHref) {
      router.push(ticketHref);
    }
  };

  const handleViewUser = () => {
    if (onViewUser) {
      onViewUser();
    } else if (userRole !== "client" && userName !== "System") {
      router.push(`/dashboard/users?search=${encodeURIComponent(userName)}`);
    } else {
      toast({
        title: "User Profile",
        description: `${userName}${userEmail ? ` (${userEmail})` : ""}`,
      });
    }
  };

  const handleCopyDetails = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const summary = `[${format(dateObj, "yyyy-MM-dd HH:mm:ss")}] ${userName}: ${activityText}${
        activity.ticketNumber ? ` (${activity.ticketNumber})` : ""
      }`;
      await navigator.clipboard.writeText(summary);
      toast({
        title: "Activity details copied",
        description: "Event summary copied to clipboard.",
      });
    } catch {
      toast({
        title: "Failed to copy",
        variant: "destructive",
      });
    }
  };

  const handleCopyTicketLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!ticketHref) return;
    try {
      const fullUrl = `${window.location.origin}${ticketHref}`;
      await navigator.clipboard.writeText(fullUrl);
      toast({
        title: "Ticket link copied",
        description: "Copied ticket URL to clipboard.",
      });
    } catch {
      toast({
        title: "Failed to copy link",
        variant: "destructive",
      });
    }
  };

  const handleOpenDetailsDialog = () => {
    if (onViewDetails) {
      onViewDetails();
    } else {
      setShowDetailsDialog(true);
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
            <span className="truncate max-w-[140px]">
              {activity.ticketNumber ? `Activity · ${activity.ticketNumber}` : "Audit Activity"}
            </span>
            <Clock className="h-3 w-3 opacity-50" />
          </ContextMenuLabel>
          <ContextMenuSeparator />

          {/* Open Related Ticket */}
          {ticketHref && (
            <ContextMenuItem
              onClick={handleOpenTicket}
              className="gap-2 text-xs font-medium cursor-pointer"
            >
              <ExternalLink className="h-3.5 w-3.5 text-primary" />
              <span>Open Related Ticket</span>
            </ContextMenuItem>
          )}

          {/* View Associated User Profile */}
          <ContextMenuItem
            onClick={handleViewUser}
            className="gap-2 text-xs font-medium cursor-pointer"
          >
            <User className="h-3.5 w-3.5 text-muted-foreground" />
            <span>View User Profile</span>
          </ContextMenuItem>

          <ContextMenuSeparator />

          {/* Copy Activity Details */}
          <ContextMenuItem
            onClick={handleCopyDetails}
            className="gap-2 text-xs font-medium cursor-pointer"
          >
            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Copy Activity Details</span>
          </ContextMenuItem>

          {/* Copy Ticket Link */}
          {ticketHref && (
            <ContextMenuItem
              onClick={handleCopyTicketLink}
              className="gap-2 text-xs font-medium cursor-pointer"
            >
              <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Copy Ticket Link</span>
            </ContextMenuItem>
          )}

          <ContextMenuSeparator />

          {/* View Full Activity Details */}
          <ContextMenuItem
            onClick={handleOpenDetailsDialog}
            className="gap-2 text-xs font-medium cursor-pointer"
          >
            <Info className="h-3.5 w-3.5 text-muted-foreground" />
            <span>View Full Details</span>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* Activity Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <Clock className="h-4 w-4 text-primary" />
              Activity Event Details
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Immutable historical event log from TicketFlow audit record.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="rounded-xl border border-border/70 bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between border-b border-border/50 pb-2">
                <span className="font-semibold text-muted-foreground">Actor</span>
                <span className="font-medium text-foreground">{userName}</span>
              </div>
              {activity.ticketNumber && (
                <div className="flex items-center justify-between border-b border-border/50 pb-2">
                  <span className="font-semibold text-muted-foreground">Ticket</span>
                  <span className="font-mono font-medium text-foreground">
                    {activity.ticketNumber}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between border-b border-border/50 pb-2">
                <span className="font-semibold text-muted-foreground">Timestamp</span>
                <span className="font-mono text-muted-foreground">
                  {format(dateObj, "MMM d, yyyy h:mm a")} ({formatDistanceToNow(dateObj, { addSuffix: true })})
                </span>
              </div>
              <div>
                <span className="font-semibold text-muted-foreground block mb-1">Details</span>
                <p className="font-medium text-foreground bg-background/80 p-2 rounded-lg border border-border/50">
                  {activityText}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-600 dark:text-emerald-400">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>Historical audit event. Cannot be altered or deleted.</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
