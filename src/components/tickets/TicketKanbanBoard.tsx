"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { ticketHref, type TicketCardTicket } from "./TicketCard";
import {
  TicketNumber,
  PriorityBadge,
  CategoryBadge,
  UserAvatar,
} from "./badges";
import {
  TicketContextMenu,
  KanbanColumnContextMenu,
  AssignmentContextMenu,
} from "@/components/productivity";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  MoreVertical,
  ExternalLink,
  Eye,
  GripVertical,
  CheckCircle2,
  Clock,
  PauseCircle,
  AlertCircle,
  XCircle,
  Layers,
} from "lucide-react";

export interface KanbanColumnDef {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
  headerBg: string;
  badgeBg: string;
}

export const KANBAN_COLUMNS: KanbanColumnDef[] = [
  {
    id: "open",
    label: "Open",
    icon: AlertCircle,
    color: "text-emerald-500",
    headerBg: "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400",
    badgeBg: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  {
    id: "in_progress",
    label: "In Progress",
    icon: Clock,
    color: "text-blue-500",
    headerBg: "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400",
    badgeBg: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  },
  {
    id: "on_hold",
    label: "On Hold",
    icon: PauseCircle,
    color: "text-amber-500",
    headerBg: "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400",
    badgeBg: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  {
    id: "resolved",
    label: "Resolved",
    icon: CheckCircle2,
    color: "text-purple-500",
    headerBg: "bg-purple-500/10 border-purple-500/20 text-purple-600 dark:text-purple-400",
    badgeBg: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  },
  {
    id: "closed",
    label: "Closed",
    icon: XCircle,
    color: "text-muted-foreground",
    headerBg: "bg-muted/40 border-border text-muted-foreground",
    badgeBg: "bg-muted text-muted-foreground",
  },
];

interface TicketKanbanBoardProps {
  tickets: (TicketCardTicket & { _id: string })[];
  currentUserId?: string;
  currentUserRole?: string;
  teamMembers?: { _id: string; name: string }[];
  categories?: { _id?: string; slug?: string; name: string }[];
  onQuickPreview?: (ticket: TicketCardTicket) => void;
  onRefresh?: () => void;
  onFilterStatus?: (status: string) => void;
  className?: string;
}

export function TicketKanbanBoard({
  tickets: initialTickets,
  currentUserId,
  currentUserRole = "client",
  teamMembers,
  categories,
  onQuickPreview,
  onRefresh,
  onFilterStatus,
  className,
}: TicketKanbanBoardProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [tickets, setTickets] = useState(initialTickets);
  const [draggedTicketId, setDraggedTicketId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  // Sync when parent tickets change
  React.useEffect(() => {
    setTickets(initialTickets);
  }, [initialTickets]);

  const isManagerial = currentUserRole === "manager" || currentUserRole === "super_admin";
  const canDrag = isManagerial || currentUserRole === "team";

  // Optimistic status transition
  const handleStatusChange = async (ticket: TicketCardTicket, newStatus: string) => {
    const ticketId = String(ticket._id || "");
    const prevStatus = ticket.status;
    if (prevStatus === newStatus || !ticketId) return;

    // Optimistically update tickets
    setTickets((prev) =>
      prev.map((t) => (t._id.toString() === ticketId ? { ...t, status: newStatus } : t))
    );

    const targetCol = KANBAN_COLUMNS.find((c) => c.id === newStatus);

    toast({
      title: `Moved to ${targetCol?.label || newStatus}`,
      description: `${ticket.ticketNumber} is now ${targetCol?.label || newStatus}`,
      action: {
        label: "Undo",
        onClick: () => void handleStatusChange(ticket, prevStatus),
      },
    });

    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update ticket status");
      }
      if (onRefresh) onRefresh();
    } catch (err) {
      // Rollback
      setTickets((prev) =>
        prev.map((t) => (t._id.toString() === ticketId ? { ...t, status: prevStatus } : t))
      );
      toast({
        title: "Move failed",
        description: err instanceof Error ? err.message : "Could not move ticket",
        variant: "destructive",
      });
    }
  };

  // Optimistic assignment transition
  const handleAssign = async (ticket: TicketCardTicket, newAssigneeId: string | null) => {
    const ticketId = String(ticket._id || "");
    if (!ticketId) return;
    const prevAssignee = ticket.assigneeId;
    const newAssigneeObj = newAssigneeId
      ? teamMembers?.find((m) => m._id === newAssigneeId) || { _id: newAssigneeId, name: "Assigned" }
      : null;

    setTickets((prev) =>
      prev.map((t) => (t._id === ticketId ? { ...t, assigneeId: newAssigneeObj as any } : t))
    );

    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigneeId: newAssigneeId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update assignment");
      }
      if (onRefresh) onRefresh();
    } catch (err) {
      setTickets((prev) =>
        prev.map((t) => (t._id === ticketId ? { ...t, assigneeId: prevAssignee } : t))
      );
      toast({
        title: "Assignment error",
        description: err instanceof Error ? err.message : "Failed to change assignment",
        variant: "destructive",
      });
    }
  };

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, ticketId: string) => {
    e.dataTransfer.setData("text/plain", ticketId);
    e.dataTransfer.effectAllowed = "move";
    setDraggedTicketId(ticketId);
  };

  const handleDragOver = (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverColumn !== colId) {
      setDragOverColumn(colId);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOverColumn(null);
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: string) => {
    e.preventDefault();
    setDragOverColumn(null);
    const ticketId = e.dataTransfer.getData("text/plain") || draggedTicketId;
    setDraggedTicketId(null);
    if (!ticketId) return;

    const targetTicket = tickets.find((t) => t._id.toString() === ticketId);
    if (!targetTicket || targetTicket.status === targetStatus) return;

    await handleStatusChange(targetTicket, targetStatus);
  };

  return (
    <div className={cn("w-full overflow-x-auto pb-4", className)}>
      <div className="flex gap-4 min-w-[1280px] p-1">
        {KANBAN_COLUMNS.map((col) => {
          const colTickets = tickets.filter((t) => t.status === col.id);
          const ColIcon = col.icon;
          const isOver = dragOverColumn === col.id;

          return (
            <KanbanColumnContextMenu
              key={col.id}
              status={col.id}
              statusLabel={col.label}
              ticketCount={colTickets.length}
              onNewTicket={(status) =>
                router.push(`/dashboard/tickets/new?status=${encodeURIComponent(status)}`)
              }
              onRefresh={onRefresh}
              onFilterStatus={onFilterStatus}
            >
              <div
                className={cn(
                  "flex-1 flex flex-col rounded-2xl border bg-card/60 transition-all duration-150 min-h-[550px]",
                  isOver
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                    : "border-border hover:border-border/80"
                )}
                onDragOver={(e) => handleDragOver(e, col.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, col.id)}
              >
                {/* Column Header */}
                <div className="flex items-center justify-between border-b border-border/70 p-3.5">
                  <div className="flex items-center gap-2">
                    <span className={cn("flex h-6 w-6 items-center justify-center rounded-lg", col.badgeBg)}>
                      <ColIcon className={cn("h-3.5 w-3.5", col.color)} />
                    </span>
                    <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                      {col.label}
                    </h3>
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", col.badgeBg)}>
                      {colTickets.length}
                    </span>
                  </div>

                  <Link
                    href={`/dashboard/tickets/new?status=${encodeURIComponent(col.id)}`}
                    className="rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                    title={`Create ticket in ${col.label}`}
                    aria-label={`Create ticket in ${col.label}`}
                  >
                    <Plus className="h-4 w-4" />
                  </Link>
                </div>

                {/* Column Body / Drop Zone */}
                <div className="flex-1 p-2.5 space-y-2.5">
                  {colTickets.length === 0 ? (
                    <div
                      className={cn(
                        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 p-6 text-center h-48 transition-colors",
                        isOver && "border-primary/50 bg-primary/10"
                      )}
                    >
                      <Layers className="h-6 w-6 text-muted-foreground/50 mb-1.5" />
                      <p className="text-xs text-muted-foreground">No tickets in {col.label}</p>
                      <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                        Drop cards or right-click to add
                      </p>
                    </div>
                  ) : (
                    colTickets.map((t) => {
                      const isDragging = draggedTicketId === t._id.toString();
                      const assignee = t.assigneeId as any;
                      const updatedAt = t.updatedAt ?? t.createdAt;
                      const timeAgo = formatDistanceToNow(new Date(updatedAt), { addSuffix: true });

                      return (
                        <TicketContextMenu
                          key={t._id}
                          ticket={t}
                          currentUserId={currentUserId}
                          currentUserRole={currentUserRole}
                          teamMembers={teamMembers}
                          categories={categories}
                          isKanban={true}
                          onStatusChange={handleStatusChange}
                          onAssign={handleAssign}
                          onQuickPreview={onQuickPreview}
                        >
                          <div
                            draggable={canDrag}
                            onDragStart={(e) => handleDragStart(e, t._id.toString())}
                            onDragEnd={() => {
                              setDraggedTicketId(null);
                              setDragOverColumn(null);
                            }}
                            className={cn(
                              "group relative rounded-xl border border-border bg-card p-3 shadow-2xs transition-all duration-150 hover:border-foreground/30 hover:shadow-sm cursor-grab active:cursor-grabbing",
                              isDragging && "opacity-40 scale-95 border-dashed border-primary"
                            )}
                          >
                            {/* Card Top: Number, Priority & Overflow Menu */}
                            <div className="flex items-center justify-between gap-1 mb-2">
                              <div className="flex items-center gap-1.5">
                                {canDrag && (
                                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
                                )}
                                <TicketNumber ticketNumber={t.ticketNumber} className="text-[11px]" />
                                <PriorityBadge priority={t.priority} />
                              </div>

                              <div className="flex items-center gap-1">
                                {onQuickPreview && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      onQuickPreview(t);
                                    }}
                                    className="hidden group-hover:inline-flex h-5 items-center gap-1 rounded bg-secondary/80 px-1.5 text-[10px] text-foreground hover:bg-secondary"
                                    title="Quick peek"
                                  >
                                    <Eye className="h-3 w-3 text-primary" />
                                  </button>
                                )}

                                {/* Overflow menu fallback for mobile & click users */}
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={(e) => e.stopPropagation()}
                                      className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                                      aria-label="Ticket options"
                                    >
                                      <MoreVertical className="h-3.5 w-3.5" />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-48">
                                    <DropdownMenuItem onClick={() => router.push(ticketHref(t))}>
                                      <ExternalLink className="mr-2 h-3.5 w-3.5 text-primary" />
                                      <span>Open Ticket</span>
                                    </DropdownMenuItem>
                                    {onQuickPreview && (
                                      <DropdownMenuItem onClick={() => onQuickPreview(t)}>
                                        <Eye className="mr-2 h-3.5 w-3.5 text-primary" />
                                        <span>Quick Peek</span>
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuSeparator />
                                    {KANBAN_COLUMNS.filter((c) => c.id !== t.status).map((c) => (
                                      <DropdownMenuItem
                                        key={c.id}
                                        onClick={() => handleStatusChange(t, c.id)}
                                      >
                                        <span>Move to {c.label}</span>
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </div>

                            {/* Card Middle: Title */}
                            <Link
                              href={ticketHref(t)}
                              className="block text-xs font-semibold text-foreground hover:text-primary transition-colors line-clamp-2 mb-2.5"
                              onClick={(e) => {
                                // If dragging just happened, don't follow link
                                if (isDragging) e.preventDefault();
                              }}
                            >
                              {t.title}
                            </Link>

                            {/* Card Bottom: Category & Assignee/Timestamp */}
                            <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/50 text-[11px] text-muted-foreground">
                              <CategoryBadge category={t.category} />
                              <div className="flex items-center gap-1.5 shrink-0">
                                <AssignmentContextMenu
                                  ticket={t}
                                  currentUserId={currentUserId}
                                  currentUserRole={currentUserRole}
                                  teamMembers={teamMembers}
                                  onAssign={(assigneeId) => handleAssign(t, assigneeId)}
                                >
                                  <div className="flex items-center gap-1.5 cursor-context-menu">
                                    {assignee ? (
                                      <UserAvatar
                                        name={assignee.name || "Assigned"}
                                        size="sm"
                                        avatar={assignee.avatar}
                                      />
                                    ) : (
                                      <span
                                        className="inline-block h-5 w-5 rounded-full border border-dashed border-muted-foreground/40"
                                        title="Unassigned"
                                      />
                                    )}
                                  </div>
                                </AssignmentContextMenu>
                                <span className="font-mono text-[10px]">{timeAgo}</span>
                              </div>
                            </div>
                          </div>
                        </TicketContextMenu>
                      );
                    })
                  )}
                </div>
              </div>
            </KanbanColumnContextMenu>
          );
        })}
      </div>
    </div>
  );
}
