"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
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
import { ticketHref, type TicketCardTicket } from "@/components/tickets/TicketCard";
import {
  ExternalLink,
  Copy,
  Link2,
  CheckCircle2,
  Clock,
  PauseCircle,
  AlertCircle,
  XCircle,
  UserCheck,
  UserX,
  CopyPlus,
  Trash2,
  Eye,
  Flag,
  Loader2,
} from "lucide-react";

const STATUS_ITEMS = [
  { value: "open", label: "Open", icon: AlertCircle, color: "text-emerald-500" },
  { value: "in_progress", label: "In Progress", icon: Clock, color: "text-blue-500" },
  { value: "on_hold", label: "On Hold", icon: PauseCircle, color: "text-amber-500" },
  { value: "resolved", label: "Resolved", icon: CheckCircle2, color: "text-purple-500" },
  { value: "closed", label: "Closed", icon: XCircle, color: "text-muted-foreground" },
];

const PRIORITY_ITEMS = [
  { value: "low", label: "Low", color: "text-sky-500" },
  { value: "medium", label: "Medium", color: "text-amber-500" },
  { value: "high", label: "High", color: "text-orange-500" },
  { value: "urgent", label: "Urgent", color: "text-rose-500" },
];

export interface TicketContextMenuProps {
  ticket: TicketCardTicket;
  currentUserId?: string;
  currentUserRole?: string;
  teamMembers?: { _id: string; name: string }[];
  onStatusChange?: (ticket: TicketCardTicket, newStatus: string) => Promise<void> | void;
  onPriorityChange?: (ticket: TicketCardTicket, newPriority: string) => Promise<void> | void;
  onAssign?: (ticket: TicketCardTicket, assigneeId: string | null) => Promise<void> | void;
  onDelete?: (ticket: TicketCardTicket) => Promise<void> | void;
  onDuplicate?: (ticket: TicketCardTicket) => Promise<void> | void;
  onQuickPreview?: (ticket: TicketCardTicket) => void;
  disabled?: boolean;
  children: React.ReactNode;
}

export function TicketContextMenu({
  ticket,
  currentUserId,
  currentUserRole = "client",
  teamMembers,
  onStatusChange,
  onPriorityChange,
  onAssign,
  onDelete,
  onDuplicate,
  onQuickPreview,
  disabled = false,
  children,
}: TicketContextMenuProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);

  const ticketId = typeof ticket._id === "string" ? ticket._id : ticket._id?.toString() || "";
  const isManagerial = currentUserRole === "manager" || currentUserRole === "super_admin";
  const isAssignedAgent =
    currentUserRole === "team" &&
    ((ticket.assigneeId as any)?._id?.toString() === currentUserId ||
      (ticket.assigneeId as any)?.toString() === currentUserId);
  const isRequester =
    (ticket.requesterId as any)?._id?.toString() === currentUserId ||
    (ticket.requesterId as any)?.toString() === currentUserId;

  const canEditStatus = isManagerial || isAssignedAgent;
  const canEditPriority = isManagerial || isAssignedAgent || isRequester;
  const canAssign = isManagerial;
  const canDelete = isManagerial;
  const canDuplicate = currentUserRole !== "client" || isRequester;

  const targetHref = ticketHref(ticket);

  const handleCopyId = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(ticket.ticketNumber);
      toast({
        title: "Ticket ID copied",
        description: `${ticket.ticketNumber} copied to clipboard`,
      });
    } catch {
      toast({ title: "Failed to copy ID", variant: "destructive" });
    }
  };

  const handleCopyLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const fullUrl = `${window.location.origin}${targetHref}`;
      await navigator.clipboard.writeText(fullUrl);
      toast({
        title: "Ticket link copied",
        description: "Direct URL copied to clipboard",
      });
    } catch {
      toast({ title: "Failed to copy link", variant: "destructive" });
    }
  };

  const handleStatusSelect = async (status: string) => {
    if (status === ticket.status) return;
    if (onStatusChange) {
      await onStatusChange(ticket, status);
      return;
    }

    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update status");
      }
      toast({
        title: "Status updated",
        description: `${ticket.ticketNumber} set to ${status.replace("_", " ")}`,
      });
      router.refresh();
    } catch (err) {
      toast({
        title: "Status update failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handlePrioritySelect = async (priority: string) => {
    if (priority === ticket.priority) return;
    if (onPriorityChange) {
      await onPriorityChange(ticket, priority);
      return;
    }

    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update priority");
      }
      toast({
        title: "Priority updated",
        description: `${ticket.ticketNumber} set to ${priority}`,
      });
      router.refresh();
    } catch (err) {
      toast({
        title: "Priority update failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleAssigneeSelect = async (assigneeId: string | null) => {
    const currentAssignee = (ticket.assigneeId as any)?._id?.toString() || (ticket.assigneeId as any)?.toString();
    if (assigneeId === currentAssignee) return;

    if (onAssign) {
      await onAssign(ticket, assigneeId);
      return;
    }

    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigneeId: assigneeId || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to assign ticket");
      }
      toast({
        title: assigneeId ? "Ticket assigned" : "Ticket unassigned",
        description: `${ticket.ticketNumber} assignment updated`,
      });
      router.refresh();
    } catch (err) {
      toast({
        title: "Assignment failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleDuplicate = async () => {
    if (onDuplicate) {
      await onDuplicate(ticket);
      return;
    }

    setIsDuplicating(true);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${ticket.title} (Copy)`,
          description: ticket.description || "Duplicated ticket details.",
          category: ticket.category || "other",
          priority: ticket.priority || "medium",
          departmentId: (ticket.departmentId as any)?._id?.toString() || (ticket.departmentId as any)?.toString() || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to duplicate ticket");
      }

      const data = await res.json();
      toast({
        title: "Ticket duplicated",
        description: `Created copy: ${data.ticket?.ticketNumber || "New ticket"}`,
      });
      router.refresh();
    } catch (err) {
      toast({
        title: "Duplication failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsDuplicating(false);
    }
  };

  const handleDelete = async () => {
    if (onDelete) {
      await onDelete(ticket);
      setShowDeleteConfirm(false);
      return;
    }

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete ticket");
      }
      toast({
        title: "Ticket deleted",
        description: `${ticket.ticketNumber} was successfully removed`,
      });
      setShowDeleteConfirm(false);
      router.refresh();
    } catch (err) {
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Failed to delete ticket",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  if (disabled) {
    return <>{children}</>;
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuLabel className="truncate font-mono">
            {ticket.ticketNumber} · {ticket.title}
          </ContextMenuLabel>
          <ContextMenuSeparator />

          <ContextMenuItem onClick={() => router.push(targetHref)}>
            <ExternalLink className="h-4 w-4 text-primary" />
            <span>Open Ticket</span>
          </ContextMenuItem>

          {onQuickPreview && (
            <ContextMenuItem onClick={() => onQuickPreview(ticket)}>
              <Eye className="h-4 w-4 text-primary" />
              <span>Quick Peek</span>
            </ContextMenuItem>
          )}

          <ContextMenuItem onClick={handleCopyId}>
            <Copy className="h-4 w-4 text-muted-foreground" />
            <span>Copy Ticket ID</span>
          </ContextMenuItem>

          <ContextMenuItem onClick={handleCopyLink}>
            <Link2 className="h-4 w-4 text-muted-foreground" />
            <span>Copy Ticket Link</span>
          </ContextMenuItem>

          <ContextMenuSeparator />

          {/* Change Status Submenu */}
          <ContextMenuSub>
            <ContextMenuSubTrigger disabled={!canEditStatus}>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              <span>Change Status</span>
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-44">
              {STATUS_ITEMS.map((item) => {
                const Icon = item.icon;
                const isCurrent = ticket.status === item.value;
                return (
                  <ContextMenuItem
                    key={item.value}
                    onClick={() => handleStatusSelect(item.value)}
                    className="justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Icon className={`h-3.5 w-3.5 ${item.color}`} />
                      <span className={isCurrent ? "font-bold text-foreground" : ""}>
                        {item.label}
                      </span>
                    </div>
                    {isCurrent && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                  </ContextMenuItem>
                );
              })}
            </ContextMenuSubContent>
          </ContextMenuSub>

          {/* Change Priority Submenu */}
          <ContextMenuSub>
            <ContextMenuSubTrigger disabled={!canEditPriority}>
              <Flag className="h-4 w-4 text-muted-foreground" />
              <span>Change Priority</span>
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-40">
              {PRIORITY_ITEMS.map((item) => {
                const isCurrent = ticket.priority === item.value;
                return (
                  <ContextMenuItem
                    key={item.value}
                    onClick={() => handlePrioritySelect(item.value)}
                    className="justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${item.color.replace("text-", "bg-")}`} />
                      <span className={isCurrent ? "font-bold text-foreground" : ""}>
                        {item.label}
                      </span>
                    </div>
                    {isCurrent && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                  </ContextMenuItem>
                );
              })}
            </ContextMenuSubContent>
          </ContextMenuSub>

          {/* Assign / Reassign Submenu */}
          {canAssign && (
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <UserCheck className="h-4 w-4 text-muted-foreground" />
                <span>Assign Ticket</span>
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-48 max-h-60 overflow-y-auto">
                <ContextMenuItem onClick={() => handleAssigneeSelect(null)}>
                  <UserX className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className={!ticket.assigneeId ? "font-bold" : ""}>Unassigned</span>
                </ContextMenuItem>
                {teamMembers && teamMembers.length > 0 && <ContextMenuSeparator />}
                {teamMembers?.map((member) => {
                  const currentAssigneeId =
                    (ticket.assigneeId as any)?._id?.toString() ||
                    (ticket.assigneeId as any)?.toString();
                  const isCurrent = currentAssigneeId === member._id;
                  return (
                    <ContextMenuItem
                      key={member._id}
                      onClick={() => handleAssigneeSelect(member._id)}
                      className="justify-between"
                    >
                      <span className={isCurrent ? "font-bold truncate" : "truncate"}>
                        {member.name}
                      </span>
                      {isCurrent && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                    </ContextMenuItem>
                  );
                })}
              </ContextMenuSubContent>
            </ContextMenuSub>
          )}

          <ContextMenuSeparator />

          {/* Duplicate Action */}
          {canDuplicate && (
            <ContextMenuItem onClick={handleDuplicate} disabled={isDuplicating}>
              {isDuplicating ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : (
                <CopyPlus className="h-4 w-4 text-muted-foreground" />
              )}
              <span>Duplicate Ticket</span>
            </ContextMenuItem>
          )}

          {/* Destructive Delete Action */}
          {canDelete && (
            <ContextMenuItem
              variant="destructive"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
              <span>Delete Ticket</span>
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>

      {/* Delete Confirmation Alert Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete ticket {ticket.ticketNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. All comments, internal notes, and attachments associated with this ticket will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
