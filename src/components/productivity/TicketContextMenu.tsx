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
  FileText,
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
  Archive,
  ArrowRight,
  ArrowLeft,
  FolderKanban,
  Eye,
  Flag,
  Loader2,
  Tag,
} from "lucide-react";

export const DEFAULT_CATEGORIES: { _id?: string; slug?: string; name: string }[] = [
  { slug: "technical", name: "Technical" },
  { slug: "billing", name: "Billing" },
  { slug: "general", name: "General" },
  { slug: "account", name: "Account" },
];

export const STATUS_ITEMS = [
  { value: "open", label: "Open", icon: AlertCircle, color: "text-emerald-500" },
  { value: "in_progress", label: "In Progress", icon: Clock, color: "text-blue-500" },
  { value: "on_hold", label: "On Hold", icon: PauseCircle, color: "text-amber-500" },
  { value: "resolved", label: "Resolved", icon: CheckCircle2, color: "text-purple-500" },
  { value: "closed", label: "Closed", icon: XCircle, color: "text-muted-foreground" },
];

export const PRIORITY_ITEMS = [
  { value: "low", label: "Low", color: "text-sky-500" },
  { value: "medium", label: "Medium", color: "text-amber-500" },
  { value: "high", label: "High", color: "text-orange-500" },
  { value: "urgent", label: "Urgent", color: "text-rose-500" },
];

const NEXT_STATUS: Record<string, { value: string; label: string }> = {
  open: { value: "in_progress", label: "In Progress" },
  in_progress: { value: "resolved", label: "Resolved" },
  on_hold: { value: "in_progress", label: "In Progress" },
  resolved: { value: "closed", label: "Closed" },
};

const PREV_STATUS: Record<string, { value: string; label: string }> = {
  closed: { value: "resolved", label: "Resolved" },
  resolved: { value: "in_progress", label: "In Progress" },
  on_hold: { value: "open", label: "Open" },
  in_progress: { value: "open", label: "Open" },
};

export interface TicketContextMenuProps {
  ticket: TicketCardTicket;
  currentUserId?: string;
  currentUserRole?: string;
  teamMembers?: { _id: string; name: string }[];
  categories?: { _id?: string; slug?: string; name: string }[];
  isKanban?: boolean;
  onStatusChange?: (ticket: TicketCardTicket, newStatus: string) => Promise<void> | void;
  onPriorityChange?: (ticket: TicketCardTicket, newPriority: string) => Promise<void> | void;
  onCategoryChange?: (ticket: TicketCardTicket, newCategory: string) => Promise<void> | void;
  onAssign?: (ticket: TicketCardTicket, assigneeId: string | null) => Promise<void> | void;
  onArchive?: (ticket: TicketCardTicket) => Promise<void> | void;
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
  categories,
  isKanban = false,
  onStatusChange,
  onPriorityChange,
  onCategoryChange,
  onAssign,
  onArchive,
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

  const handleCopyTitle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(ticket.title);
      toast({
        title: "Ticket title copied",
        description: `"${ticket.title.slice(0, 45)}${ticket.title.length > 45 ? "…" : ""}" copied to clipboard`,
      });
    } catch {
      toast({ title: "Failed to copy title", variant: "destructive" });
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

  const handleArchive = async () => {
    if (onArchive) {
      await onArchive(ticket);
      return;
    }
    await handleStatusSelect("closed");
  };

  const handleCategorySelect = async (category: string) => {
    if (category === ticket.category) return;
    if (onCategoryChange) {
      await onCategoryChange(ticket, category);
      return;
    }

    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update category");
      }
      toast({
        title: "Category updated",
        description: `${ticket.ticketNumber} moved to ${category}`,
      });
      router.refresh();
    } catch (err) {
      toast({
        title: "Category update failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const categoryList = categories && categories.length > 0 ? categories : DEFAULT_CATEGORIES;
  const nextStatus = NEXT_STATUS[ticket.status];
  const prevStatus = PREV_STATUS[ticket.status];
  const otherStatuses = STATUS_ITEMS.filter((item) => item.value !== ticket.status);

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

          <ContextMenuItem onClick={handleCopyTitle}>
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span>Copy Ticket Title</span>
          </ContextMenuItem>

          <ContextMenuItem onClick={handleCopyLink}>
            <Link2 className="h-4 w-4 text-muted-foreground" />
            <span>Copy Ticket Link</span>
          </ContextMenuItem>

          <ContextMenuSeparator />

          {/* Kanban / Board Status Actions */}
          {canEditStatus && (
            <>
              {nextStatus && (
                <ContextMenuItem onClick={() => handleStatusSelect(nextStatus.value)}>
                  <ArrowRight className="h-4 w-4 text-emerald-500" />
                  <span>Move to {nextStatus.label}</span>
                </ContextMenuItem>
              )}

              {prevStatus && (
                <ContextMenuItem onClick={() => handleStatusSelect(prevStatus.value)}>
                  <ArrowLeft className="h-4 w-4 text-blue-500" />
                  <span>Move back to {prevStatus.label}</span>
                </ContextMenuItem>
              )}

              <ContextMenuSub>
                <ContextMenuSubTrigger>
                  <FolderKanban className="h-4 w-4 text-muted-foreground" />
                  <span>Move to Column</span>
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className="w-44">
                  {otherStatuses.map((item) => {
                    const Icon = item.icon;
                    return (
                      <ContextMenuItem
                        key={item.value}
                        onClick={() => handleStatusSelect(item.value)}
                      >
                        <div className="flex items-center gap-2">
                          <Icon className={`h-3.5 w-3.5 ${item.color}`} />
                          <span>{item.label}</span>
                        </div>
                      </ContextMenuItem>
                    );
                  })}
                </ContextMenuSubContent>
              </ContextMenuSub>
              <ContextMenuSeparator />
            </>
          )}

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

          {/* Change Category Submenu */}
          {categoryList.length > 0 && (
            <ContextMenuSub>
              <ContextMenuSubTrigger disabled={!canEditStatus}>
                <Tag className="h-4 w-4 text-muted-foreground" />
                <span>Change Category</span>
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-44 max-h-60 overflow-y-auto">
                {categoryList.map((cat) => {
                  const slug = cat.slug || cat._id || cat.name.toLowerCase();
                  const isCurrent = ticket.category === slug;
                  return (
                    <ContextMenuItem
                      key={slug}
                      onClick={() => handleCategorySelect(slug)}
                      className="justify-between"
                    >
                      <span className={isCurrent ? "font-bold truncate" : "truncate"}>{cat.name}</span>
                      {isCurrent && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                    </ContextMenuItem>
                  );
                })}
              </ContextMenuSubContent>
            </ContextMenuSub>
          )}

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

          {/* Archive Action */}
          {canEditStatus && ticket.status !== "closed" && (
            <ContextMenuItem onClick={handleArchive}>
              <Archive className="h-4 w-4 text-muted-foreground" />
              <span>Archive Ticket</span>
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
