"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ChevronDown, ChevronUp, ArrowUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { TRANSFERS_ENABLED } from "@/lib/features";
import { StatusBadge, PriorityBadge, UserAvatar, DepartmentBadge } from "./badges";
import { ticketHref, type TicketCardTicket } from "./TicketCard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

type TableTicket = TicketCardTicket & { _id: string };

type SortKey = "number" | "title" | "sender" | "status" | "priority" | "received" | "department";
type SortDir = "asc" | "desc";

// Sentinel for the "Unassigned" option — Radix Select treats "" as unset, so
// an empty-string value would break the picker.
const UNASSIGNED = "__unassigned__";

const STATUS_ORDER = ["open", "in_progress", "on_hold", "resolved", "closed"];
const PRIORITY_ORDER = ["low", "medium", "high", "urgent"];

/** Next statuses allowed from each status — mirrors the detail-page transition map. */
const TRANSITIONS: Record<string, string[]> = {
  open: ["in_progress", "on_hold"],
  in_progress: ["on_hold", "resolved", "open"],
  on_hold: ["in_progress", "open"],
  resolved: ["closed", "open"],
  closed: ["open"],
};

interface TicketTableProps {
  tickets: TableTicket[];
  currentUserId: string;
  currentUserRole: string;
  /** The signed-in manager's department — gates the deny-transfer action. */
  currentDepartmentId?: string;
  /** Called after a successful mutation so the parent can re-sync. */
  onChanged?: () => void;
}

export function TicketTable({
  tickets,
  currentUserId,
  currentUserRole,
  currentDepartmentId,
  onChanged,
}: TicketTableProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [sortKey, setSortKey] = useState<SortKey>("received");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selected, setSelected] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Optimistic overlay: ticketId → partial patch applied to displayed rows
  // before the server confirms. Rolled back on failure; parent refetch
  // (onChanged) is the source of truth on success.
  const [optimistic, setOptimistic] = useState<Map<string, Partial<TableTicket>>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  const isManager = currentUserRole === "manager";
  // Super admins get read-only status; managers and the assigned team agent
  // can still edit it.
  const canEditStatus = (t: TableTicket) =>
    ["manager"].includes(currentUserRole) ||
    (currentUserRole === "team" && t.assigneeId?._id?.toString() === currentUserId);

  // Manager's assignable pool: their own department's team members and
  // managers (server scopes /api/users to the manager's department, so no
  // cross-department leakage). Super admins deliberately get no picker here —
  // their only assignment power is forwarding unassigned tickets to managers.
  const [teamMembers, setTeamMembers] = useState<{ _id: string; name: string }[]>([]);
  useEffect(() => {
    if (!isManager) return;
    let cancelled = false;
    Promise.all([
      fetch("/api/users?role=team&limit=100"),
      fetch("/api/users?role=manager&limit=100"),
    ])
      .then(async ([teamRes, mgrRes]) => {
        const teamData = teamRes.ok ? await teamRes.json() : { users: [] };
        const mgrData = mgrRes.ok ? await mgrRes.json() : { users: [] };
        if (cancelled) return;
        const seen = new Set<string>();
        const merged: { _id: string; name: string }[] = [];
        for (const u of [...(teamData.users ?? []), ...(mgrData.users ?? [])]) {
          const id = u?._id?.toString?.() ?? "";
          if (!id || seen.has(id) || u.active === false) continue;
          seen.add(id);
          merged.push({ _id: id, name: u.name ?? "Unknown" });
        }
        setTeamMembers(merged);
      })
      .catch(() => {
        /* picker stays empty; server still enforces its own rules */
      });
    return () => {
      cancelled = true;
    };
  }, [isManager]);

  const sorted = useMemo(() => {
    // Optimistic overlay: clone patched rows instead of mutating the parent's
    // ticket objects — Object.assign on the original would corrupt React state
    // and make failure-rollback impossible (the "restored" row would keep the
    // patched values).
    const rows = tickets.map((t) => {
      const patch = optimistic.get(t._id);
      return patch ? { ...t, ...patch } : t;
    });
    const val = (t: TableTicket) => {
      switch (sortKey) {
        case "number":
          return t.ticketNumber;
        case "title":
          return t.title.toLowerCase();
        case "sender":
          // Original filer (client, agent, manager…) — unsorted-last when absent.
          return (t.requesterId as { name?: string } | undefined)?.name?.toLowerCase() ?? "";
        case "status":
          return STATUS_ORDER.indexOf(t.status);
        case "priority":
          return PRIORITY_ORDER.indexOf(t.priority);
        case "received":
          return new Date(t.createdAt).getTime();
        case "department":
          return (
            (t.departmentId as { name?: string } | undefined)?.name?.toLowerCase() ?? ""
          );
      }
    };
    rows.sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [tickets, sortKey, sortDir, optimistic]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "received" ? "desc" : "asc");
    }
  };

  // J/K + arrow keyboard navigation (aria-activedescendant pattern).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => Math.min((s ?? -1) + 1, sorted.length - 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => Math.max((s ?? sorted.length) - 1, 0));
      } else if (e.key === "Enter" && selected !== null) {
        e.preventDefault();
        router.push(ticketHref(sorted[selected]));
      } else if (e.key === "Escape") {
        setSelected(null);
      }
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [sorted, selected, router]);

  useEffect(() => {
    if (selected === null) return;
    containerRef.current
      ?.querySelector(`[data-row-index="${selected}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  /** Optimistic PATCH: apply locally at once, roll back the overlay on failure,
   *  and offer an undo (reverse patch + refetch) on success.
   *  `displayPatch` (optional) overrides what the optimistic overlay stores —
   *  used when the API value is a raw id string but the UI expects a populated
   *  { _id, name } assignee object. */
  const mutate = async (
    t: TableTicket,
    patch: Record<string, unknown>,
    label: string,
    displayPatch?: Partial<TableTicket>
  ) => {
    setBusyId(t._id);
    const snapshot: Record<string, unknown> = {
      status: t.status,
      priority: t.priority,
      assigneeId: t.assigneeId ? (t.assigneeId as unknown as { _id: string })._id : null,
    };
    // 1. Optimistic apply — the row changes color/position immediately.
    setOptimistic((prev) => new Map(prev).set(t._id, (displayPatch ?? patch) as Partial<TableTicket>));
    try {
      const res = await fetch(`/api/tickets/${t._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Update failed");
      }
      // 2. Success: parent refetch reconciles; drop the overlay entry.
      setOptimistic((prev) => {
        const next = new Map(prev);
        next.delete(t._id);
        return next;
      });
      onChanged?.();
      toast({
        title: label,
        description: `${t.ticketNumber} updated`,
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              const undoRes = await fetch(`/api/tickets/${t._id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(snapshot),
              });
              if (undoRes.ok) onChanged?.();
            } catch {
              toast({ title: "Couldn't undo", variant: "destructive" });
            }
          },
        },
      });
    } catch (error) {
      // 3. Failure: roll the row back to its pre-mutation values.
      setOptimistic((prev) => {
        const next = new Map(prev);
        next.delete(t._id);
        return next;
      });
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  /** Manager assigns/unassigns from the inline picker. Display patch keeps
   *  rows render-safe (populated { _id, name } object, never a raw id). */
  const assignTo = (t: TableTicket, memberId: string) => {
    const current = (t.assigneeId as TicketCardTicket["assigneeId"] | undefined)?._id?.toString();
    if (memberId === UNASSIGNED) {
      if (!current) return;
      void mutate(t, { assigneeId: null }, "Ticket unassigned", { assigneeId: null as unknown as TicketCardTicket["assigneeId"] });
      return;
    }
    if (memberId === current) return;
    const member = teamMembers.find((m) => m._id === memberId);
    void mutate(
      t,
      { assigneeId: memberId },
      "Ticket assigned",
      { assigneeId: { _id: memberId, name: member?.name ?? "…" } as unknown as TicketCardTicket["assigneeId"] }
    );
  };

  /** Deny an incoming transfer addressed to this manager's department
   *  (directly, or via an agent in the department). Two-step confirm with an
   *  optional sender-facing reason. */
  const [denyArmId, setDenyArmId] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState("");
  const denyTransfer = async (t: TableTicket) => {
    setBusyId(t._id);
    try {
      const res = await fetch(`/api/tickets/${t._id}/transfer`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", reason: denyReason.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to deny transfer");
      toast({
        title: "Transfer denied",
        description: `${t.ticketNumber} was returned to the sender's department.`,
      });
      setDenyArmId(null);
      setDenyReason("");
      onChanged?.();
    } catch (error) {
      toast({
        title: "Action failed",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  /** A pending transfer the current manager may deny: their department is
   *  the target (directly, or via an agent in it). The server re-checks with
   *  canDecideTransfer regardless. Dormant while TRANSFERS_ENABLED is false
   *  (a ticket is non-transferable between teams by product decision). */
  const canDeny = (t: TableTicket) =>
    TRANSFERS_ENABLED &&
    currentUserRole === "manager" &&
    t.transfer?.status === "pending" &&
    (!!currentDepartmentId && t.transfer?.toDepartmentId?._id?.toString() === currentDepartmentId ||
      t.transfer?.toManagerId?._id?.toString() === currentUserId);

  const columns: { key: SortKey | null; label: string; className?: string }[] = [
    { key: "number", label: "Number", className: "w-28 hidden sm:table-cell" },
    { key: "title", label: "Title" },
    { key: "sender", label: "Sent by", className: "w-32 hidden xl:table-cell" },
    { key: "status", label: "Status", className: "w-36" },
    { key: "priority", label: "Priority", className: "w-28 hidden md:table-cell" },
    { key: null, label: "Assignee", className: isManager ? "w-40" : "w-12" },
    { key: "received", label: "Received", className: "w-28 hidden lg:table-cell text-right" },
    { key: "department", label: "Department", className: "w-32" },
  ];

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="grid"
      aria-label="Ticket list — use J and K to move, Enter to open"
      aria-activedescendant={selected !== null ? `ticket-row-${selected}` : undefined}
      className="focus-visible:outline-none"
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            {columns.map((col) => (
              <th
                key={col.label}
                scope="col"
                aria-sort={
                  col.key === sortKey
                    ? sortDir === "asc"
                      ? "ascending"
                      : "descending"
                    : undefined
                }
                className={cn("px-3 py-2.5 font-medium text-muted-foreground", col.className)}
              >
                {col.key ? (
                  <button
                    type="button"
                    onClick={() => toggleSort(col.key!)}
                    className="inline-flex items-center gap-1 rounded transition-colors hover:text-foreground"
                  >
                    {col.label}
                    {col.key === sortKey ? (
                      sortDir === "asc" ? (
                        <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-0" aria-hidden />
                    )}
                  </button>
                ) : (
                  <span className="sr-only">{col.label}</span>
                )}
              </th>
            ))}
            <th className="w-40 px-3 py-2.5">
              <span className="sr-only">Quick actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((t, index) => {
            const isSelected = selected === index;
            const editable = canEditStatus(t);
            const assignee = t.assigneeId as TicketCardTicket["assigneeId"];
            // Original filer — client, another agent, a manager, etc.
            const senderName = (t.requesterId as { name?: string } | undefined)?.name;
            const dept = t.departmentId as { name?: string; color?: string } | undefined;
            return (
              <tr
                key={t._id}
                id={`ticket-row-${index}`}
                data-row-index={index}
                aria-selected={isSelected}
                className={cn(
                  "group border-b border-border/50 transition-colors last:border-0",
                  isSelected ? "bg-primary/5" : "hover:bg-muted/40"
                )}
              >
                <td className="px-3 py-2.5 hidden sm:table-cell">
                  <span className="font-mono text-xs text-muted-foreground">{t.ticketNumber}</span>
                </td>
                <td className="max-w-0 px-3 py-2.5">
                  <Link
                    href={ticketHref(t)}
                    className="block truncate font-medium text-foreground hover:text-primary"
                  >
                    {t.title}
                  </Link>
                  <span className="text-xs capitalize text-muted-foreground sm:hidden">
                    {t.ticketNumber} · {t.category}
                  </span>
                  <span className="hidden text-xs text-muted-foreground sm:inline">
                    {t.category}
                  </span>
                </td>
                <td className="max-w-28 truncate px-3 py-2.5 hidden xl:table-cell">
                  {senderName ? (
                    <span className="inline-flex items-center gap-1.5" title={senderName}>
                      <UserAvatar name={senderName} size="sm" />
                      <span className="truncate text-xs text-muted-foreground">{senderName}</span>
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <StatusBadge status={t.status} />
                </td>
                <td className="px-3 py-2.5 hidden md:table-cell">
                  <PriorityBadge priority={t.priority} />
                </td>
                <td className="px-3 py-2.5">
                  {isManager ? (
                    <Select
                      value={assignee ? assignee._id?.toString() : UNASSIGNED}
                      onValueChange={(next) => assignTo(t, next)}
                      disabled={busyId === t._id}
                    >
                      <SelectTrigger
                        className="h-7 w-36 px-2 text-xs"
                        aria-label={`Assign ${t.ticketNumber}`}
                      >
                        {assignee ? (
                          <span className="truncate">{assignee.name}</span>
                        ) : (
                          <span className="truncate text-muted-foreground">Assign to…</span>
                        )}
                      </SelectTrigger>
                      <SelectContent>
                        {assignee && <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>}
                        {teamMembers.map((m) => (
                          <SelectItem key={m._id} value={m._id}>
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : assignee ? (
                    <span title={assignee.name}>
                      <UserAvatar name={assignee.name} size="sm" />
                    </span>
                  ) : (
                    <span
                      className="inline-block h-6 w-6 rounded-full border border-dashed border-muted-foreground/40"
                      title="Unassigned"
                    />
                  )}
                </td>
                <td className="hidden whitespace-nowrap px-3 py-2.5 text-right font-mono text-xs tabular-nums text-muted-foreground lg:table-cell">
                  {format(new Date(t.createdAt), "MMM d, yyyy")}
                </td>
                <td className="px-3 py-2.5">
                  {dept?.name ? (
                    <DepartmentBadge name={dept.name} color={dept.color ?? ""} />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                    {editable && (
                      <Select
                        value={t.status}
                        onValueChange={(next) =>
                          next !== t.status && mutate(t, { status: next }, `Marked ${next.replace("_", " ")}`)
                        }
                      >
                        <SelectTrigger
                          className="h-7 w-[7.5rem] px-2 text-xs"
                          aria-label={`Change status of ${t.ticketNumber}`}
                        >
                          <span className="truncate">{t.status.replace("_", " ")}</span>
                        </SelectTrigger>
                        <SelectContent>
                          {[t.status, ...(TRANSITIONS[t.status] ?? [])].map((s) => (
                            <SelectItem key={s} value={s} className="text-xs">
                              {s.replace("_", " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {canDeny(t) &&
                      (denyArmId === t._id ? (
                        <div className="flex w-64 flex-col gap-1.5">
                          <textarea
                            value={denyReason}
                            onChange={(e) => setDenyReason(e.target.value)}
                            rows={2}
                            maxLength={500}
                            placeholder="Why deny? (optional, sent to sender)"
                            aria-label="Reason for denying the transfer"
                            className="w-full resize-none rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/40"
                          />
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              disabled={busyId === t._id}
                              onClick={() => {
                                setDenyArmId(null);
                                setDenyReason("");
                              }}
                            >
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              className="h-7 gap-1 px-2 text-xs"
                              loading={busyId === t._id}
                              onClick={() => denyTransfer(t)}
                            >
                              Confirm deny
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                          disabled={busyId === t._id}
                          onClick={() => setDenyArmId(t._id)}
                        >
                          <X className="h-3.5 w-3.5" aria-hidden />
                          Deny
                        </Button>
                      )
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
