"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ticketHref, UserAvatar, StatusBadge, PriorityBadge, CategoryBadge, TicketNumber } from "@/components/tickets";
import { formatDistanceToNow } from "date-fns";
import { TRANSFERS_ENABLED } from "@/lib/features";
import {
  UserPlus,
  AlertTriangle,
  TicketCheck,
  Undo2,
  X,
} from "lucide-react";
import { IUser, IDepartment } from "@/lib/db/models";
import { useSession } from "next-auth/react";
import { useToast } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface TicketWithRelations {
  _id: string;
  ticketNumber: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  requesterId?: IUser;
  assigneeId?: IUser;
  departmentId?: IDepartment;
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
  transfer?: { status?: string } | null;
}

export function QueueContent() {
  const { toast } = useToast();

  // Queue page admits managers and super admins. Managers assign within
  // their department; super admins only FORWARD to a manager (server
  // enforces the same split on PATCH).
  const isSuperAdmin = useSession().data?.user?.role === "super_admin";

  const [tickets, setTickets] = useState<TicketWithRelations[]>([]);
  const [teamMembers, setTeamMembers] = useState<IUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [selectedAssigneeId, setSelectedAssigneeId] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Two-step deny: first click arms the row, second click confirms. The
  // optional reason is sent to the sender with the rejection notification.
  const [confirmDenyId, setConfirmDenyId] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState("");

  /** Deny an incoming transfer: returns it to the sender's department and
   *  notifies them. Available for transfers addressed to the manager
   *  directly OR to an agent in this department. */
  const handleDeny = async (ticketId: string) => {
    setBusyId(ticketId);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/transfer`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", reason: denyReason.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to deny transfer");
      toast({
        title: "Transfer denied",
        description: "The ticket was returned to the sender's department.",
      });
      setConfirmDenyId(null);
      setDenyReason("");
      // Refresh the queue (the denied ticket leaves it).
      const res2 = await fetch("/api/tickets?view=unassigned&limit=50");
      if (res2.ok) {
        const d2 = await res2.json();
        setTickets(d2.tickets ?? []);
      }
    } catch (err) {
      toast({
        title: "Action failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  useEffect(() => {
    async function fetchData() {
      try {
        // Managers pick from their own team + managers (dept-scoped server
        // side); super admins only ever forward to a manager.
        const [ticketsRes, teamRes, managersRes] = await Promise.all([
          fetch("/api/tickets?view=unassigned&limit=50"),
          isSuperAdmin ? Promise.resolve(null) : fetch("/api/users?role=team&limit=100"),
          fetch("/api/users?role=manager&limit=100"),
        ]);

        if (!ticketsRes.ok) throw new Error("Failed to fetch tickets");
        if (teamRes && !teamRes.ok) throw new Error("Failed to fetch team members");
        if (!managersRes.ok) throw new Error("Failed to fetch managers");

        const ticketsData = await ticketsRes.json();
        const teamData = teamRes ? await teamRes.json() : { users: [] };
        const managersData = await managersRes.json();

        const seen = new Set<string>();
        const assignable = [...(teamData.users || []), ...(managersData.users || [])].filter(
          (u: IUser) => {
            const id = u._id.toString();
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
          }
        );

        setTickets(ticketsData.tickets);
        setTeamMembers(assignable);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load queue");
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [isSuperAdmin]);

  const handleAssign = async () => {
    if (!selectedTicketId || !selectedAssigneeId) return;

    setIsAssigning(true);
    try {
      const res = await fetch(`/api/tickets/${selectedTicketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigneeId: selectedAssigneeId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to assign ticket");
      }

      toast({
        title: isSuperAdmin ? "Ticket forwarded" : "Ticket assigned",
        description: isSuperAdmin
          ? "The manager can now assign it within their team"
          : "Ticket has been assigned to the selected team member",
      });
      setSelectedTicketId(null);
      setSelectedAssigneeId("");

      // Refresh tickets
      const res2 = await fetch("/api/tickets?view=unassigned&limit=50");
      const data = await res2.json();
      setTickets(data.tickets);
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to assign ticket", variant: "destructive" });
    } finally {
      setIsAssigning(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6" aria-label="Loading queue" aria-busy="true">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <Skeleton className="h-8 w-48 rounded-md mb-1.5" />
            <Skeleton className="h-4 w-64 rounded-md" />
          </div>
        </div>

        {/* Queue List Card */}
        <Card className="card-elevated">
          <CardContent className="p-0">
            <ul className="divide-y divide-border/60">
              {[1, 2, 3, 4, 5].map((i) => (
                <li
                  key={i}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-5 w-16 rounded" />
                      <Skeleton className="h-5 w-16 rounded-full" />
                      <Skeleton className="hidden sm:inline-flex h-5 w-20 rounded-full" />
                    </div>
                    <Skeleton className="mt-2 h-4 w-3/5 rounded" />
                    <div className="mt-2 flex items-center gap-2">
                      <Skeleton className="h-4 w-16 rounded" />
                      <Skeleton className="h-3 w-20 rounded font-mono" />
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 w-full sm:w-auto">
                    <Skeleton className="h-9 sm:h-8 w-full sm:w-24 rounded-md" />
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">Failed to load queue</h2>
        <p className="text-muted-foreground mb-4">{error}</p>
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-header-title">Unassigned Queue</h1>
          <p className="page-header-sub">
            {tickets.length} ticket{tickets.length !== 1 ? "s" : ""} waiting for assignment
          </p>
        </div>
      </div>

      {/* Assign Dialog */}
      <Dialog open={!!selectedTicketId} onOpenChange={(open) => !open && setSelectedTicketId(null)}>
        <DialogTrigger asChild>
          <Button variant="outline" onClick={() => setSelectedTicketId(null)} className="hidden" />
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isSuperAdmin ? "Forward Ticket" : "Assign Ticket"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-muted-foreground">
              {isSuperAdmin
                ? "Forward this unassigned ticket to a manager. They can then assign it to a member of their team."
                : "Select a team member to assign this ticket to. The department will be inferred from the assignee."}
            </p>
            <div className="space-y-2">
              <Label htmlFor="assignee">{isSuperAdmin ? "Manager" : "Team Member"}</Label>
              <Select value={selectedAssigneeId} onValueChange={setSelectedAssigneeId}>
                <SelectTrigger id="assignee" className="w-full">
                  <SelectValue placeholder={isSuperAdmin ? "Select manager" : "Select team member"} />
                </SelectTrigger>
                <SelectContent>
                  {teamMembers
                    .filter((m: IUser) => !isSuperAdmin || m.role === "manager")
                    .map((member) => (
                    <SelectItem key={member._id.toString()} value={member._id.toString()}>
                      <div className="flex items-center gap-2">
                        <UserAvatar name={member.name} role={member.role as any} size="sm" />
                        <div>
                          <p className="font-medium">{member.name}</p>
                          <p className="text-xs text-muted-foreground">{member.email}</p>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedTicketId(null)}>
              Cancel
            </Button>
            <Button onClick={handleAssign} loading={isAssigning}>
              {isSuperAdmin ? "Forward Ticket" : "Assign Ticket"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tickets List */}
      <Card className="card-elevated">
        <CardContent className="p-0">
          {tickets.length === 0 ? (
            <div className="p-12 text-center">
              <TicketCheck className="w-12 h-12 text-success mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-1">No unassigned tickets</h3>
              <p className="text-muted-foreground">All tickets have been assigned. Great work!</p>
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {[...tickets]
                .sort((a, b) => {
                  const rank = { urgent: 0, high: 1, medium: 2, low: 3 };
                  return (rank[a.priority as keyof typeof rank] ?? 4) - (rank[b.priority as keyof typeof rank] ?? 4);
                })
                .map((ticket) => {
                const assignee = ticket.assigneeId;
                const dept = ticket.departmentId;
                return (
                  <li
                    key={ticket._id}
                    className="flex flex-col gap-3 p-4 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <TicketNumber ticketNumber={ticket.ticketNumber} className="text-xs" />
                        <PriorityBadge priority={ticket.priority} />
                        <span className="sm:hidden">
                          <StatusBadge status={ticket.status} />
                        </span>
                        {dept && (
                          <span
                            className="hidden sm:inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold"
                            style={{ borderColor: `${dept.color}55`, color: dept.color, backgroundColor: `${dept.color}14` }}
                          >
                            {dept.name}
                          </span>
                        )}
                      </div>
                      <Link
                        href={ticketHref(ticket)}
                        className="mt-1 block truncate font-medium text-foreground hover:text-primary"
                      >
                        {ticket.title}
                      </Link>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <CategoryBadge category={ticket.category} />
                        <span className="font-mono">
                          {formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 w-full sm:w-auto">
                      {assignee ? (
                        <UserAvatar name={assignee.name} role={assignee.role as any} size="sm" />
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => {
                              setSelectedTicketId(ticket._id);
                              setSelectedAssigneeId("");
                            }}
                            className="w-full sm:w-auto gap-2 h-9 sm:h-8 font-semibold"
                          >
                            <UserPlus className="h-4 w-4" aria-hidden />
                            {isSuperAdmin ? "Forward" : "Assign"}
                          </Button>
                          {/* Deny: pending incoming transfer (addressed to this
                              manager or to an agent in this department).
                              Dormant while transfers are disabled. */}
                          {TRANSFERS_ENABLED && ticket.transfer?.status === "pending" && (
                            confirmDenyId === ticket._id ? (
                              <div className="flex flex-col gap-1.5">
                                <textarea
                                  value={denyReason}
                                  onChange={(e) => setDenyReason(e.target.value)}
                                  rows={2}
                                  maxLength={500}
                                  placeholder="Why deny? (optional, sent to sender)"
                                  aria-label="Reason for denying the transfer"
                                  className="w-64 resize-none rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/40"
                                />
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={busyId === ticket._id}
                                    onClick={() => {
                                      setConfirmDenyId(null);
                                      setDenyReason("");
                                    }}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    loading={busyId === ticket._id}
                                    onClick={() => handleDeny(ticket._id)}
                                  >
                                    <Undo2 className="mr-1 h-3.5 w-3.5" aria-hidden />
                                    Confirm deny
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="destructive-outline"
                                disabled={busyId === ticket._id}
                                onClick={() => setConfirmDenyId(ticket._id)}
                                className="gap-1.5"
                              >
                                <X className="h-3.5 w-3.5" aria-hidden />
                                Deny
                              </Button>
                            )
                          )}
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}