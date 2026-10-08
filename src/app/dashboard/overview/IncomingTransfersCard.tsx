"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PriorityBadge, TransferStatusBadge, UserAvatar } from "@/components/tickets";
import { Timestamp } from "@/components/ui/timestamp";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  ArrowRightLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Inbox,
  Loader2,
  X,
} from "lucide-react";

export interface PendingTransferTicket {
  _id: string;
  ticketNumber: string;
  title: string;
  priority: string;
  category: string;
  status: string;
  requesterId?: { name?: string } | null;
  departmentId?: { name?: string; color?: string } | null;
  transfer?: {
    direction?: string;
    priority?: string;
    note?: string;
    sentAt?: string | Date;
    fromId?: { name?: string; role?: string } | null;
    toUserId?: { name?: string } | null;
    toManagerId?: { name?: string } | null;
    toDepartmentId?: { name?: string; color?: string } | null;
  } | null;
}

interface IncomingTransfersCardProps {
  /** Role from the session; card renders only for managers. */
  role?: string;
  /** Called after any approve/reject so the parent can refresh its stats. */
  onChanged?: () => void;
}

/**
 * Manager approval inbox for inter-department transfers. Lists every pending
 * incoming transfer with inline Approve / Reject actions. Polls every 30s and
 * on window focus (same cadence as the notifications bell). Managers-only by
 * design: managers settle transfers between themselves; nothing renders for
 * agents, clients, or super admins.
 */
export function IncomingTransfersCard({ role, onChanged }: IncomingTransfersCardProps) {
  const { toast } = useToast();
  const [transfers, setTransfers] = useState<PendingTransferTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ id: string; action: "approve" | "reject" } | null>(
    null
  );
  /** Sender-facing explanation typed when denying. */
  const [denyReason, setDenyReason] = useState("");
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch("/api/transfers/pending", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setTransfers(data.transfers ?? []);
      }
    } catch {
      // keep last known list
    } finally {
      inFlight.current = false;
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (role !== "manager") return;
    load();
    const id = setInterval(load, 30_000);
    window.addEventListener("focus", load);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", load);
    };
  }, [role, load]);

  const pendingCount = transfers.length;

  if (role !== "manager") return null;
  // The card only earns a spot on the dashboard when there is actually
  // something to approve — no permanent "nothing pending" placeholder.
  if (isLoading || pendingCount === 0) return null;

  const decide = async (ticketId: string, action: "approve" | "reject") => {
    setBusyId(ticketId);
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
            ? "The ticket is now in your department."
            : "The sender has been notified.",
      });
      setTransfers((prev) => prev.filter((t) => t._id !== ticketId));
      setDenyReason("");
      onChanged?.();
    } catch (err) {
      toast({
        title: "Action failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
      load(); // resync on failure
    } finally {
      setBusyId(null);
      setConfirming(null);
    }
  };

  return (
    <Card className="border-primary/30">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <ArrowRightLeft className="h-4 w-4 text-primary" aria-hidden />
          Incoming Transfers
          {pendingCount > 0 && (
            <span
              className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-semibold text-destructive-foreground tabular-nums"
              aria-label={`${pendingCount} pending transfers`}
            >
              {pendingCount}
            </span>
          )}
        </CardTitle>
        <div className="flex items-center gap-1">
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse incoming transfers" : "Expand incoming transfers"}
          >
            {expanded ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
          </Button>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-3">
          {pendingCount === 0 ? (
            <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Inbox className="h-4 w-4" aria-hidden />
              No pending transfers — nothing needs your approval.
            </p>
          ) : (
            transfers.map((t) => {
              const transfer = t.transfer ?? {};
              const recipientName =
                transfer.direction === "agent"
                  ? transfer.toUserId?.name
                  : transfer.toManagerId?.name ?? "you";
              const isConfirming = confirming?.id === t._id;
              const isBusy = busyId === t._id;
              return (
                <div
                  key={t._id}
                  className={cn(
                    "rounded-xl border border-border bg-muted/20 p-3 transition-opacity",
                    isBusy && "opacity-60"
                  )}
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="font-mono text-xs text-muted-foreground">{t.ticketNumber}</span>
                    <Link
                      href={`/dashboard/tickets/${t._id}`}
                      className="min-w-0 flex-1 truncate text-sm font-medium text-foreground hover:text-primary"
                    >
                      {t.title}
                    </Link>
                    <PriorityBadge priority={t.priority} />
                    <TransferStatusBadge status="pending" />
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <UserAvatar name={transfer.fromId?.name ?? "?"} size="sm" role={transfer.fromId?.role} />
                      From <span className="font-medium text-foreground">{transfer.fromId?.name ?? "Unknown"}</span>
                    </span>
                    {transfer.direction === "agent" && recipientName && (
                      <span>
                        for <span className="font-medium text-foreground">{recipientName}</span>
                      </span>
                    )}
                    <span>
                      sent <Timestamp date={transfer.sentAt ?? new Date()} />
                    </span>
                  </div>

                  {transfer.note && (
                    <p className="mt-2 rounded-lg bg-background/60 p-2 text-xs leading-relaxed text-muted-foreground">
                      {transfer.note}
                    </p>
                  )}

                  <div className="mt-2.5 flex items-center justify-end gap-2">
                    {isConfirming ? (
                    <div className="w-full space-y-2">
                      {confirming?.action === "approve" ? (
                        <p className="text-xs text-muted-foreground">
                          {transfer.direction === "agent"
                            ? `Send to ${recipientName ?? "the agent"}?`
                            : "Move into your department (unassigned)?"}
                        </p>
                      ) : (
                        <div>
                          <label
                            htmlFor={`deny-reason-${t._id}`}
                            className="mb-1 block text-xs font-medium text-foreground"
                          >
                            Why are you denying this?{' '}
                            <span className="font-normal text-muted-foreground">(sent to the sender — optional)</span>
                          </label>
                          <textarea
                            id={`deny-reason-${t._id}`}
                            value={denyReason}
                            onChange={(e) => setDenyReason(e.target.value)}
                            rows={2}
                            maxLength={500}
                            placeholder="e.g. wrong department — this belongs to Billing"
                            className="w-full resize-none rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/40"
                          />
                        </div>
                      )}
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isBusy}
                          onClick={() => {
                            setConfirming(null);
                            setDenyReason("");
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          variant={confirming?.action === "reject" ? "destructive" : "default"}
                          loading={isBusy}
                          onClick={() => decide(t._id, confirming!.action)}
                        >
                          Confirm {confirming?.action}
                        </Button>
                      </div>
                    </div>
                  ) : (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isBusy}
                          onClick={() => setConfirming({ id: t._id, action: "reject" })}
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        >
                          <X className="mr-1 h-3.5 w-3.5" aria-hidden />
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          disabled={isBusy}
                          onClick={() => setConfirming({ id: t._id, action: "approve" })}
                        >
                          <Check className="mr-1 h-3.5 w-3.5" aria-hidden />
                          Approve
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      )}
    </Card>
  );
}
