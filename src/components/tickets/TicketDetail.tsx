"use client";

import { useEffect, useState } from "react";
import {
  StatusBadge,
  PriorityBadge,
  CategoryBadge,
  DepartmentBadge,
  TicketNumber,
} from "./badges";
import { ConversationPanel, type ChatParticipant } from "./ConversationPanel";
import { ViewersChip } from "./ViewersChip";
import { TransferPanel, TicketMiniDashboard, type TransferSubdoc } from "./TransferPanel";
import { TransferDialog } from "./TransferDialog";
import type { ITicket, IComment, IUser, IDepartment } from "@/lib/db/models";
import { canSetPriority, isConversationParticipant, isReceivingManager, toTransferRef } from "@/lib/transfer";
import { TRANSFERS_ENABLED } from "@/lib/features";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Trash2,
  FileText,
  Clock,
  Flag,
  MessageSquare,
  Download,
  Loader2,
  RotateCcw,
  Send,
  Lock,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Timestamp } from "@/components/ui/timestamp";
import { useToast } from "@/components/ui/toast";

// Sentinel for the "Unassigned" option in the assignee picker.
const UNASSIGNED = "__unassigned__";

interface TicketDetailProps {
  ticket: ITicket & {
    requesterId?: IUser;
    assigneeId?: IUser;
    departmentId?: IDepartment;
    assignedBy?: IUser;
    transfer?: TransferSubdoc | null;
  };
  comments: (IComment & { authorId?: IUser })[];
  /** The conversation's parties (sender / manager / agent), server-resolved. */
  chatParticipants?: ChatParticipant[];
  currentUser: {
    id: string;
    role: string;
    departmentId?: string;
  };
  onUpdateTicket: (updates: Record<string, unknown>) => Promise<void>;
  onAddComment: (body: string, attachment?: File) => Promise<void>;
  onCommentsChanged?: () => void;
  onDeleteTicket?: () => Promise<void>;
  /** Bumped on every live SSE push — drives receipt refresh in the chat panel. */
  liveEventCount?: number;
  /** Whether the SSE stream is currently connected (small live badge). */
  sseLive?: boolean;
}

export function TicketDetail({
  ticket,
  comments,
  chatParticipants,
  currentUser,
  liveEventCount,
  sseLive,
  onUpdateTicket,
  onAddComment,
  onCommentsChanged,
  onDeleteTicket,
}: TicketDetailProps) {
  const [editStatus, setEditStatus] = useState(ticket.status);
  const [editPriority, setEditPriority] = useState(ticket.priority);
  const [editAssignee, setEditAssignee] = useState(
    ticket.assigneeId?._id?.toString() || UNASSIGNED
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const [isReopening, setIsReopening] = useState(false);
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
  const [agents, setAgents] = useState<{ userId: string; name: string }[]>([]);
  const [managers, setManagers] = useState<{ userId: string; name: string }[]>([]);
  const [isDenying, setIsDenying] = useState(false);
  const [denialReason, setDenialReason] = useState("");
  const [isSubmittingDenial, setIsSubmittingDenial] = useState(false);
  const { toast } = useToast();

  const assigneeIdStr = ticket.assigneeId?._id?.toString();
  const transfer = (ticket.transfer ?? null) as TransferSubdoc | null;

  // Priority rule (project-wide): the sender of record chooses priority — the
  // filer for regular tickets, the dispatching user for transferred ones.
  // Everyone else reads it, including managers and super admins.
  const priorityLocked = !canSetPriority(
    { id: currentUser.id, role: currentUser.role, departmentId: currentUser.departmentId },
    {
      requesterId: (ticket.requesterId as IUser | undefined)?._id,
      transfer: transfer ? { ...transfer, fromId: transfer.fromId?._id } : null,
    }
  );

  // Staff can dispatch a ticket to another department; a ticket already in a
  // (pending/approved) transfer cannot be re-sent. TRANSFERS are DORMANT by
  // product decision (a ticket is non-transferable between teams) — the flag
  // keeps the button and dialog out of the UI without touching the logic.
  const canSendTransfer =
    TRANSFERS_ENABLED &&
    ["team", "manager", "super_admin"].includes(currentUser.role) &&
    transfer?.status !== "pending";

  // Status rule (project-wide): only managers and the assigned agent may move
  // status; super admins and the filing agent read it.
  const statusWritable =
    currentUser.role === "manager" ||
    (currentUser.role === "team" && assigneeIdStr === currentUser.id);

  // Keep the action selects in sync with the ticket prop after updates.
  useEffect(() => {
    setEditStatus(ticket.status);
    setEditPriority(ticket.priority);
    setEditAssignee(assigneeIdStr || UNASSIGNED);
  }, [ticket.status, ticket.priority, assigneeIdStr]);

  // Fetch assignable agents for the assignee dropdown (internal users only).
  useEffect(() => {
    if (currentUser.role === "client") return;
    let cancelled = false;
    fetch("/api/routing/agents")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.agents) return;
        const mapped = data.agents
          .filter((a: { role: string }) => a.role === "team" || a.role === "manager")
          .map((a: { userId: string; name: string }) => ({ userId: a.userId, name: a.name }));
        setAgents(mapped);
        // Super admins forward unassigned tickets to any active manager.
        setManagers(
          data.agents
            .filter((a: { role: string }) => a.role === "manager")
            .map((a: { userId: string; name: string }) => ({ userId: a.userId, name: a.name }))
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [currentUser.role]);

  const assignee = ticket.assigneeId as IUser | undefined;
  const department = ticket.departmentId as IDepartment | undefined;
  const assignedBy = ticket.assignedBy as IUser | undefined;
  const isClient = currentUser.role === "client";

  const canEdit =
    ["super_admin", "manager"].includes(currentUser.role) ||
    (currentUser.role === "team" && assignee?._id?.toString() === currentUser.id);

  // Assignment is a manager power — with one super-admin exception: FORWARD an
  // unassigned ticket to a manager (routes it into that manager's department;
  // the manager then assigns their own team). Super admins never pick agents.
  const canAssign = currentUser.role === "manager";
  const canForward =
    currentUser.role === "super_admin" && !assigneeIdStr && ticket.status !== "closed";

  // A ticket should only be deleted by manager of the receiving agent or the superadmin, noone else
  const assigneeDeptId =
    (ticket.assigneeId as IUser | undefined)?.departmentId?.toString() ||
    (ticket.departmentId as IDepartment | undefined)?._id?.toString() ||
    ticket.departmentId?.toString();
  const assigneeReportingManagerId = (ticket.assigneeId as IUser | undefined)?.reportingManagerId?.toString();
  const transferRef = toTransferRef(transfer as any);
  const isTargetReceivingManager = isReceivingManager(
    { id: currentUser.id, role: currentUser.role, departmentId: currentUser.departmentId },
    transferRef
  );

  const isReceivingAgentManager =
    currentUser.role === "manager" &&
    (
      (currentUser.departmentId && assigneeDeptId === currentUser.departmentId) ||
      (assigneeReportingManagerId && currentUser.id === assigneeReportingManagerId) ||
      isTargetReceivingManager
    );

  const canDelete =
    (currentUser.role === "super_admin" || isReceivingAgentManager) && !!onDeleteTicket;

  // Client reopen: requester of a resolved/closed ticket may send it back to open.
  const isOwnTicket = ticket.requesterId?._id?.toString() === currentUser.id;
  const canClientReopen =
    isClient && isOwnTicket && ["resolved", "closed"].includes(ticket.status);

  const canTransition = (newStatus: string) => {
    if (isClient) {
      return isOwnTicket && ["resolved", "closed"].includes(ticket.status) && newStatus === "open";
    }
    // Status is writable only by managers and the assigned agent.
    if (!statusWritable) return false;
    if (currentUser.role === "team") {
      const allowed: Record<string, string[]> = {
        open: ["in_progress", "on_hold"],
        in_progress: ["on_hold", "resolved", "open"],
        on_hold: ["in_progress", "open"],
        resolved: ["closed", "open"],
        closed: ["open"],
      };
      return allowed[ticket.status]?.includes(newStatus) ?? false;
    }
    return currentUser.role === "manager";
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!canTransition(newStatus)) return;
    if (newStatus === "closed" && (currentUser.role === "manager" || currentUser.role === "super_admin")) {
      setIsDenying(true);
      return;
    }
    const prevStatus = editStatus;
    setEditStatus(newStatus as any);
    try {
      await onUpdateTicket({ status: newStatus });
      toast({ title: "Status updated", description: `Ticket marked as ${newStatus.replace("_", " ")}` });
    } catch {
      setEditStatus(prevStatus);
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
    }
  };

  const confirmDenial = async () => {
    setIsSubmittingDenial(true);
    const prevStatus = editStatus;
    setEditStatus("closed");
    try {
      await onUpdateTicket({ status: "closed" });
      if (denialReason.trim()) {
        await onAddComment(`**Ticket Request Denied**\n\nReason: ${denialReason.trim()}`);
      }
      toast({
        title: "Ticket denied",
        description: "The ticket request has been denied and closed.",
      });
      setIsDenying(false);
      setDenialReason("");
    } catch {
      setEditStatus(prevStatus);
      toast({ title: "Error", description: "Failed to deny ticket", variant: "destructive" });
    } finally {
      setIsSubmittingDenial(false);
    }
  };


  const handlePriorityChange = async (newPriority: string) => {
    const prevPriority = editPriority;
    setEditPriority(newPriority as any);
    try {
      await onUpdateTicket({ priority: newPriority });
      toast({ title: "Priority updated" });
    } catch {
      setEditPriority(prevPriority);
      toast({ title: "Error", description: "Failed to update priority", variant: "destructive" });
    }
  };

  const handleAssigneeChange = async (newAssigneeId: string) => {
    const prevAssignee = editAssignee;
    setEditAssignee(newAssigneeId);
    try {
      await onUpdateTicket({ assigneeId: newAssigneeId === UNASSIGNED ? null : newAssigneeId });
      toast({ title: "Assignee updated" });
    } catch {
      setEditAssignee(prevAssignee);
      toast({ title: "Error", description: "Failed to update assignee", variant: "destructive" });
    }
  };

  const handleForwardChange = async (managerId: string) => {
    const target = managers.find((m) => m.userId === managerId);
    const prevAssignee = editAssignee;
    setEditAssignee(managerId);
    try {
      await onUpdateTicket({ assigneeId: managerId });
      toast({
        title: "Ticket forwarded",
        description: target ? `${ticket.ticketNumber} is now with ${target.name}.` : undefined,
      });
    } catch {
      setEditAssignee(prevAssignee);
      toast({ title: "Error", description: "Failed to forward ticket", variant: "destructive" });
    }
  };

  const handleReopen = async () => {
    const prevStatus = editStatus;
    setEditStatus("open");
    setIsReopening(true);
    try {
      await onUpdateTicket({ status: "open" });
      toast({ title: "Ticket reopened" });
    } catch {
      setEditStatus(prevStatus);
      toast({ title: "Error", description: "Failed to reopen ticket", variant: "destructive" });
    } finally {
      setIsReopening(false);
    }
  };

  const handleDeleteTicket = async () => {
    if (!onDeleteTicket) return;
    setIsDeleting(true);
    try {
      await onDeleteTicket();
    } catch {
      toast({ title: "Error", description: "Failed to delete ticket", variant: "destructive" });
      setIsDeleting(false);
    }
  };

  const statusOptions = [
    { value: "open", label: "Open" },
    { value: "in_progress", label: "In Progress" },
    { value: "on_hold", label: "On Hold" },
    { value: "resolved", label: "Resolved" },
    { value: "closed", label: "Closed" },
  ].filter((s) => canTransition(s.value) || s.value === ticket.status);

  return (
    <div className="space-y-6">
      {/* Title header — single source of truth (parents no longer render their own h1) */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <TicketNumber ticketNumber={ticket.ticketNumber} className="text-sm" />
          <StatusBadge status={ticket.status} />
          {/* Priority is internal workflow info — never shown to clients. */}
          {!isClient && <PriorityBadge priority={ticket.priority} />}
        </div>
        {!isClient && (
          <div className="mt-2">
            <ViewersChip ticketId={ticket._id.toString()} isClient={isClient} />
          </div>
        )}
        <div className="mt-2 flex items-start justify-between gap-3">
          <h1 className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            {ticket.title}
          </h1>
          <div className="flex shrink-0 items-center gap-2">
            {canSendTransfer && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsTransferDialogOpen(true)}
                className="shrink-0"
              >
                <Send className="mr-1.5 h-4 w-4" aria-hidden />
                Send to team
              </Button>
            )}
            {canDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive-outline"
                    size="sm"
                    disabled={isDeleting}
                    className="shrink-0"
                  >
                    {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {ticket.ticketNumber}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently deletes the ticket and its comments. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel asChild>
                      <Button variant="outline">Cancel</Button>
                    </AlertDialogCancel>
                    <AlertDialogAction asChild>
                      <Button
                        variant="destructive"
                        onClick={handleDeleteTicket}
                      >
                        Delete ticket
                      </Button>
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
        {/* Meta row. Staff: deliberately minimal — only who assigned it and
            when it was created (category/status/priority/department live in
            the Details card). Clients keep the fuller row since they have no
            sidebar. */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
          {isClient ? (
            <>
              <CategoryBadge category={ticket.category} />
              {department && <DepartmentBadge name={department.name} color={department.color} />}
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" aria-hidden />
                Created <Timestamp date={ticket.createdAt} />
              </span>
              {ticket.closedAt && (
                <span className="inline-flex items-center gap-1.5">
                  <Flag className="h-3.5 w-3.5" aria-hidden />
                  Closed {new Date(ticket.closedAt).toLocaleDateString()}
                </span>
              )}
            </>
          ) : (
            <>
              {assignedBy && (
                <span className="inline-flex items-center gap-1.5">
                  Assigned by {assignedBy.name}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" aria-hidden />
                Created <Timestamp date={ticket.createdAt} />
              </span>
            </>
          )}
        </div>
        {!isClient && (
          <div className="mt-2.5 flex items-center gap-2 lg:hidden">
            <a
              href="#ticket-manage-section"
              className="inline-flex h-7.5 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-semibold text-foreground shadow-2xs hover:bg-secondary active:scale-95 transition-all"
            >
              Manage & Details ({ticket.status.replace("_", " ")}) ↓
            </a>
          </div>
        )}
      </div>

      {/* Client reopen — lives here so it's never hidden by accident */}
      {canClientReopen && (
        <Card className="border-warning/30 bg-warning-muted">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium text-warning">
                This ticket is {ticket.status.replace("_", " ")}
              </p>
              <p className="text-sm text-muted-foreground">
                If the issue persists, you can send it back to open.
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="warning-outline" disabled={isReopening}>
                  {isReopening ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <RotateCcw className="mr-2 h-4 w-4" aria-hidden />}
                  Reopen ticket
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reopen {ticket.ticketNumber}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The ticket returns to open and the team will pick it up again.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel asChild>
                    <Button variant="outline">Cancel</Button>
                  </AlertDialogCancel>
                  <AlertDialogAction asChild>
                    <Button variant="warning" onClick={handleReopen}>Reopen</Button>
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Main column */}
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                {ticket.description}
              </p>
            </CardContent>
          </Card>

          {ticket.attachments && ticket.attachments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4" aria-hidden />
                  Attachments ({ticket.attachments.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {ticket.attachments.map((att) => (
                    <li key={att._id?.toString()}>
                      <a
                        href={`/api/tickets/${ticket._id}/attachments/${att._id}`}
                        download={att.name}
                        className="flex items-center gap-2 text-sm text-primary hover:underline"
                      >
                        <Download className="h-4 w-4" aria-hidden />
                        {att.name}
                        <span className="text-xs text-muted-foreground">
                          ({(att.size / 1024).toFixed(1)} KB)
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <div className="border-t border-border pt-6">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <MessageSquare className="h-5 w-5" aria-hidden />
                Conversation
              </h2>
              <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                {comments.length} {comments.length === 1 ? "message" : "messages"}
                {sseLive !== undefined && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] normal-case",
                      sseLive ? "bg-success-muted text-success" : "bg-muted text-muted-foreground"
                    )}
                    title={sseLive ? "Live — updates arrive instantly" : "Reconnecting…"}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", sseLive ? "animate-pulse bg-success" : "bg-muted-foreground/50")} />
                    {sseLive ? "Live" : "Offline"}
                  </span>
                )}
              </p>
            </div>
            <ConversationPanel
              ticketId={ticket._id.toString()}
              comments={comments}
              currentUserId={currentUser.id}
              currentUserRole={currentUser.role}
              ticketStatus={ticket.status}
              chatParticipants={chatParticipants}
              liveEventCount={liveEventCount}
              canPost={isConversationParticipant(currentUser, {
                requesterId: (ticket.requesterId as IUser | undefined)?._id,
                assigneeId: assigneeIdStr,
                departmentId: (department as IDepartment | undefined)?._id,
                // Populated subdoc → raw ids, matching the server-side shape.
                transfer: transfer
                  ? {
                      ...transfer,
                      fromId: transfer.fromId?._id,
                      toUserId: transfer.toUserId?._id,
                      toManagerId: transfer.toManagerId?._id,
                      toDepartmentId: transfer.toDepartmentId?._id,
                    }
                  : undefined,
              })}
              onAddComment={onAddComment}
              onCommentsChanged={onCommentsChanged}
            />
          </div>
        </div>

        {/* Manage sidebar — internal users only */}
        {!isClient && (
          <aside id="ticket-manage-section" className="space-y-4 lg:sticky lg:top-20 lg:self-start scroll-mt-16" aria-label="Ticket actions">
            {/* Small at-a-glance dashboard: project, sender, age, transfer state */}
            <TicketMiniDashboard ticket={ticket} transfer={transfer} />

            {transfer && TRANSFERS_ENABLED && (
              <TransferPanel
                ticketId={ticket._id.toString()}
                transfer={transfer}
                currentUser={currentUser}
                onChanged={async () => {
                  await onUpdateTicket({});
                  onCommentsChanged?.();
                }}
              />
            )}

            {canEdit && (
            <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Manage</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="mb-2 flex items-center gap-1.5 text-sm font-medium" htmlFor="ticket-status">
                    Status
                    {!statusWritable && (
                      <span
                        className="inline-flex items-center gap-1 text-[11px] font-normal text-muted-foreground"
                        title="Only the assigned agent or a manager can change the status"
                      >
                        <Lock className="h-3 w-3" aria-hidden /> read-only
                      </span>
                    )}
                  </Label>
                  {!statusWritable ? (
                    // Read-only: state stays visible, but only the assigned
                    // agent or a manager may move it.
                    <div className="flex h-9 items-center rounded-md border border-border bg-muted/40 px-3">
                      <StatusBadge status={ticket.status} />
                    </div>
                  ) : (
                    <>
                      <Select value={isDenying ? "closed" : editStatus} onValueChange={handleStatusChange}>
                        <SelectTrigger id="ticket-status" className="w-full">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          {statusOptions.map((s) => (
                            <SelectItem key={s.value} value={s.value}>
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {(currentUser.role === "manager" || currentUser.role === "super_admin") && ticket.status !== "closed" && !isDenying && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setIsDenying(true)}
                          className="mt-2 w-full text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20"
                        >
                          Deny Ticket Request
                        </Button>
                      )}

                      {isDenying && (
                        <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                          <Label htmlFor="denial-reason" className="text-xs font-semibold text-destructive">
                            Reason for denial
                          </Label>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            Provide an explanation for denying this ticket request.
                          </p>
                          <textarea
                            id="denial-reason"
                            rows={3}
                            value={denialReason}
                            onChange={(e) => setDenialReason(e.target.value)}
                            placeholder="Write the reason for denial (sent to the ticket thread)..."
                            aria-label="Reason for denial"
                            className="mt-2 w-full resize-none rounded-md border border-border bg-background p-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-destructive"
                          />
                          <div className="mt-2 flex items-center justify-end gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={isSubmittingDenial}
                              onClick={() => {
                                setIsDenying(false);
                                setDenialReason("");
                              }}
                            >
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              disabled={isSubmittingDenial}
                              onClick={confirmDenial}
                            >
                              {isSubmittingDenial ? (
                                <>
                                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                  Denying...
                                </>
                              ) : (
                                "Confirm Denial"
                              )}
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div>
                  <Label className="mb-2 flex items-center gap-1.5 text-sm font-medium" htmlFor="ticket-priority">
                    Priority
                    {priorityLocked && (
                      <span
                        className="inline-flex items-center gap-1 text-[11px] font-normal text-muted-foreground"
                        title="Only the sender of this ticket can change its priority"
                      >
                        <Lock className="h-3 w-3" aria-hidden /> locked
                      </span>
                    )}
                  </Label>
                  {priorityLocked ? (
                    // Sender-chosen priority: readable by everyone involved,
                    // editable only by the sender of record.
                    <div className="flex h-9 items-center rounded-md border border-border bg-muted/40 px-3">
                      <PriorityBadge priority={ticket.priority} />
                    </div>
                  ) : (
                    <Select value={editPriority} onValueChange={handlePriorityChange}>
                      <SelectTrigger id="ticket-priority" className="w-full">
                        <SelectValue placeholder="Select priority" />
                      </SelectTrigger>
                      <SelectContent>
                        {["low", "medium", "high", "urgent"].map((p) => (
                          <SelectItem key={p} value={p}>
                            {p.charAt(0).toUpperCase() + p.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {canAssign && (
                  <div>
                    <Label className="mb-2 block text-sm font-medium" htmlFor="ticket-assignee">
                      Assign to
                    </Label>
                    <Select value={editAssignee} onValueChange={handleAssigneeChange}>
                      <SelectTrigger id="ticket-assignee" className="w-full">
                        <SelectValue placeholder="Assign to…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                        {agents.map((a) => (
                          <SelectItem key={a.userId} value={a.userId}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {canForward && (
                  <div>
                    <Label className="mb-2 block text-sm font-medium" htmlFor="ticket-forward">
                      Forward to manager
                    </Label>
                    <Select value={UNASSIGNED} onValueChange={handleForwardChange}>
                      <SelectTrigger id="ticket-forward" className="w-full">
                        <SelectValue placeholder="Choose a manager…" />
                      </SelectTrigger>
                      <SelectContent>
                        {managers.map((m) => (
                          <SelectItem key={m.userId} value={m.userId}>
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Sends this unassigned ticket to that manager, who assigns it within their team.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Ticket</span>
                  <TicketNumber ticketNumber={ticket.ticketNumber} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Category</span>
                  <span className="capitalize">{ticket.category}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Priority</span>
                  <PriorityBadge priority={ticket.priority} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Status</span>
                  <StatusBadge status={ticket.status} />
                </div>
                {department && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Department</span>
                    <DepartmentBadge name={department.name} color={department.color} />
                  </div>
                )}
              </CardContent>
            </Card>
            </>
            )}
          </aside>
        )}
      </div>

      {TRANSFERS_ENABLED && (
        <TransferDialog
          open={isTransferDialogOpen}
          onClose={() => setIsTransferDialogOpen(false)}
          senderRole={currentUser.role}
          ticketId={ticket._id.toString()}
          ticketNumber={ticket.ticketNumber}
          currentPriority={ticket.priority}
          ticketCategory={ticket.category}
          onSent={onCommentsChanged ?? (() => {})}
        />
      )}
    </div>
  );
}
