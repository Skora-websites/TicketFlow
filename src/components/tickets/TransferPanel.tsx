"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TransferStatusBadge, PriorityBadge, DepartmentBadge, UserAvatar } from "./badges";
import { Button } from "@/components/ui/button";
import { Timestamp } from "@/components/ui/timestamp";
import { useToast } from "@/components/ui/toast";
import {
  ArrowRightLeft,
  Building2,
  Check,
  X,
  Clock,
} from "lucide-react";
import type { IUser } from "@/lib/db/models";

// Shape of a populated transfer subdoc as returned by the API. `_id` is typed
// `unknown` so both raw ObjectIds (unpopulated) and strings satisfy it.
export interface TransferSubdoc {
  status?: string;
  direction?: string;
  priority?: string;
  note?: string;
  sentAt?: string | Date;
  readAt?: string | Date | null;
  approvedAt?: string | Date | null;
  rejectedAt?: string | Date | null;
  fromId?: { _id?: unknown; name?: string; email?: string; role?: string } | null;
  toUserId?: { _id?: unknown; name?: string; email?: string } | null;
  toManagerId?: { _id?: unknown; name?: string; email?: string } | null;
  toDepartmentId?: { _id?: unknown; name?: string; color?: string } | null;
  approvedBy?: { _id?: unknown; name?: string } | null;
  rejectedBy?: { _id?: unknown; name?: string } | null;
  /** Why the receiving manager denied the transfer (optional). */
  rejectionReason?: string;
}

interface TransferPanelProps {
  ticketId: string;
  transfer: TransferSubdoc | null;
  currentUser: { id: string; role: string; departmentId?: string };
  /** Refresh ticket data after approve/reject. */
  onChanged: () => void;
}

/**
 * Inter-department transfer panel (ticket detail page). Shows the transfer
 * trail — sender, target department, recipient, sent/received times — and,
 * for the receiving manager, Approve / Reject actions. The displayed priority
 * is READ-ONLY here by design: it was set by the sender and cannot be changed
 * by anyone on the receiving side (not even the manager).
 */
export function TransferPanel({ ticketId, transfer, currentUser, onChanged }: TransferPanelProps) {
  const { toast } = useToast();
  const [isDeciding, setIsDeciding] = useState(false);
  const [confirming, setConfirming] = useState<"approve" | "reject" | null>(null);
  /** Sender-facing explanation typed when denying. */
  const [denyReason, setDenyReason] = useState("");

  // Managers-only: transfers are settled between the two managers; the super
  // admin oversees but never decides.
  const isReceivingManager =
    transfer?.status === "pending" &&
    currentUser.role === "manager" &&
    !!currentUser.departmentId &&
    String(transfer?.toDepartmentId?._id ?? "") === currentUser.departmentId;

  const decide = async (action: "approve" | "reject") => {
    setIsDeciding(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/transfer`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: action === "reject" ? denyReason.trim() : undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed");
      toast({
        title: action === "approve" ? "Transfer approved" : "Transfer rejected",
        description:
          action === "approve"
            ? transfer?.direction === "agent"
              ? `Ticket sent to ${transfer?.toUserId?.name ?? "the agent"}.`
              : "Assign it to a team member from the Manage panel."
            : denyReason.trim()
              ? "The sender has been notified with your reason."
              : "The ticket stays with the sender's team.",
      });
      onChanged();
    } catch (err) {
      toast({
        title: "Action failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsDeciding(false);
      setConfirming(null);
    }
  };

  if (!transfer) return null;

  return (
    <Card className="border-primary/30">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <ArrowRightLeft className="h-4 w-4 text-primary" aria-hidden />
          Inter-department Transfer
        </CardTitle>
        <TransferStatusBadge status={transfer.status} />
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">From</span>
          <span className="inline-flex items-center gap-1.5">
            <UserAvatar name={transfer.fromId?.name ?? "?"} size="sm" role={transfer.fromId?.role as string} />
            {transfer.fromId?.name ?? "Unknown"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">To department</span>
          {transfer.toDepartmentId ? (
            <DepartmentBadge
              name={transfer.toDepartmentId.name ?? ""}
              color={transfer.toDepartmentId.color ?? "#6B7280"}
            />
          ) : (
            "—"
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">
            {transfer.direction === "agent" ? "Target agent" : "Recipient"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <UserAvatar name={transfer.toUserId?.name ?? transfer.toManagerId?.name ?? "?"} size="sm" />
            {transfer.toUserId?.name ?? transfer.toManagerId?.name ?? "—"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Priority (set by sender)</span>
          <PriorityBadge priority={transfer.priority ?? "medium"} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Sent</span>
          <Timestamp date={transfer.sentAt ?? new Date()} />
        </div>
        {transfer.status === "approved" && transfer.approvedBy?.name && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Approved by</span>
            <span>{transfer.approvedBy.name}</span>
          </div>
        )}
        {transfer.status === "rejected" && transfer.rejectedBy?.name && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Denied by</span>
            <span>{transfer.rejectedBy.name}</span>
          </div>
        )}
        {transfer.status === "rejected" && transfer.rejectionReason && (
          <div className="rounded-lg border border-destructive/20 bg-destructive-muted/60 p-2.5">
            <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-destructive">
              Reason from the denying manager
            </p>
            <p className="text-xs leading-relaxed text-foreground">{transfer.rejectionReason}</p>
          </div>
        )}
        {transfer.note && (
          <p className="rounded-lg bg-muted/50 p-2.5 text-xs leading-relaxed text-muted-foreground">
            {transfer.note}
          </p>
        )}

        {isReceivingManager && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
            {confirming === null ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isDeciding}
                  onClick={() => setConfirming("reject")}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <X className="mr-1 h-3.5 w-3.5" aria-hidden />
                  Reject
                </Button>
                <Button size="sm" disabled={isDeciding} onClick={() => setConfirming("approve")}>
                  <Check className="mr-1 h-3.5 w-3.5" aria-hidden />
                  Approve
                </Button>
              </>
            ) : (
              <div className="w-full space-y-2">
                {confirming === "approve" ? (
                  <span className="block text-xs text-muted-foreground">
                    {transfer.direction === "agent"
                      ? `Send to ${transfer.toUserId?.name ?? "the agent"}?`
                      : "Move into your department (unassigned)?"}
                  </span>
                ) : (
                  <div>
                    <label
                      htmlFor="transfer-deny-reason"
                      className="mb-1 block text-xs font-medium text-foreground"
                    >
                      Why are you denying this?{' '}
                      <span className="font-normal text-muted-foreground">(sent to the sender — optional)</span>
                    </label>
                    <textarea
                      id="transfer-deny-reason"
                      value={denyReason}
                      onChange={(e) => setDenyReason(e.target.value)}
                      rows={2}
                      maxLength={500}
                      placeholder="e.g. no capacity this sprint — resend next week"
                      className="w-full resize-none rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/40"
                    />
                  </div>
                )}
                <div className="flex items-center justify-end gap-2">
                  <Button variant="ghost" size="sm" disabled={isDeciding} onClick={() => { setConfirming(null); setDenyReason(""); }}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant={confirming === "reject" ? "destructive" : "default"}
                    loading={isDeciding}
                    onClick={() => decide(confirming)}
                  >
                    Confirm {confirming}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {transfer.status === "pending" && !isReceivingManager && (
          <p className="flex items-center gap-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" aria-hidden />
            Waiting for {transfer.toDepartmentId?.name ?? "the receiving"} manager&apos;s approval.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

interface MiniDashboardProps {
  ticket: {
    ticketNumber: string;
    title: string;
    createdAt: string | Date;
    requesterId?: IUser;
    assigneeId?: IUser;
    departmentId?: { name?: string; color?: string } | null;
  };
  transfer: TransferSubdoc | null;
}

/**
 * Compact at-a-glance panel for the ticket detail page: project/department,
 * requester (sender), age, and transfer context.
 */
export function TicketMiniDashboard({ ticket, transfer }: MiniDashboardProps) {
  const [now, setNow] = useState(() => Date.now());

  // Refresh "age of ticket" every minute without re-rendering the whole page.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const created = new Date(ticket.createdAt).getTime();
  const ageMs = Math.max(0, now - created);
  const ageHours = Math.floor(ageMs / 3_600_000);
  const ageDays = Math.floor(ageHours / 24);
  const ageLabel =
    ageDays > 0 ? `${ageDays}d ${ageHours % 24}h` : ageHours > 0 ? `${ageHours}h` : `${Math.max(1, Math.floor(ageMs / 60_000))}m`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-4 w-4 text-primary" aria-hidden />
          Ticket Overview
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Project</span>
          <span className="max-w-[60%] truncate font-medium">
            {ticket.departmentId?.name ?? "Unassigned"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Raised by</span>
          <span className="inline-flex items-center gap-1.5">
            <UserAvatar name={(ticket.requesterId as IUser | undefined)?.name ?? "?"} size="sm" />
            {(ticket.requesterId as IUser | undefined)?.name ?? "—"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Age</span>
          <span className="inline-flex items-center gap-1.5 font-mono text-xs tabular-nums">
            <Clock className="h-3 w-3 text-muted-foreground" aria-hidden />
            {ageLabel}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Date added</span>
          <Timestamp date={ticket.createdAt} mode="date" />
        </div>
        {transfer && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Transfer</span>
            <span className="inline-flex items-center gap-1.5">
              <ArrowRightLeft className="h-3 w-3 text-muted-foreground" aria-hidden />
              from {transfer.fromId?.name ?? "—"} → {transfer.toDepartmentId?.name ?? "—"}
            </span>
          </div>
        )}
        {transfer?.status === "pending" && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Received</span>
            <Timestamp date={transfer.sentAt ?? ticket.createdAt} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
