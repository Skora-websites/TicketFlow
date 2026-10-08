"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { useCategories } from "@/hooks/use-categories";
import { ArrowRightLeft, Loader2 } from "lucide-react";

export interface TransferTargetDept {
  id: string;
  name: string;
  color?: string;
}

export interface TransferTargetMember {
  id: string;
  name: string;
  email: string;
  role: string;
  departmentId: string | null;
}

interface TransferDialogProps {
  open: boolean;
  onClose: () => void;
  ticketId: string;
  ticketNumber: string;
  /** Current priority of the ticket; the sender may adjust it here (only place left). */
  currentPriority: string;
  /** The ticket's category slug — categories linked to a department can only
   *  be sent to that department (enforced server-side too). */
  ticketCategory?: string;
  /** Sender's role — super admins are limited to manager-directed transfers. */
  senderRole?: string;
  onSent: () => void;
}

/**
 * "Send to team" dialog for the inter-department panel. The sender picks:
 *  - target department (never their own),
 *  - recipient mode: a specific agent (needs the receiving manager's approval)
 *    or the manager directly (manager assigns a team member),
 *  - the priority — set by the sender, then read-only for the receiving side.
 */
export function TransferDialog({
  open,
  onClose,
  ticketId,
  ticketNumber,
  currentPriority,
  ticketCategory,
  senderRole,
  onSent,
}: TransferDialogProps) {
  // Super admins dispatch manager-directed only; team/manager may pick either.
  const managerOnly = senderRole === "super_admin";
  const { toast } = useToast();
  const { categories } = useCategories();

  const [departments, setDepartments] = useState<TransferTargetDept[]>([]);
  const [members, setMembers] = useState<TransferTargetMember[]>([]);
  const [deptId, setDeptId] = useState("");
  const [direction, setDirection] = useState<"agent" | "manager">("agent");
  const [agentId, setAgentId] = useState("");
  const [priority, setPriority] = useState(currentPriority || "medium");
  const [note, setNote] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setIsLoading(true);
    fetch("/api/tickets/transfer-targets")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load"))))
      .then((data) => {
        if (cancelled) return;
        setDepartments(data.departments ?? []);
        setMembers(data.members ?? []);
      })
      .catch(() => {
        if (!cancelled) toast({ title: "Error", description: "Failed to load departments", variant: "destructive" });
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, toast]);

  useEffect(() => {
    if (open) {
      setDeptId("");
      setDirection(managerOnly ? "manager" : "agent");
      setAgentId("");
      setPriority(currentPriority || "medium");
      setNote("");
    }
  }, [open, currentPriority, managerOnly]);

  const deptMembers = useMemo(
    () => members.filter((m) => m.departmentId === deptId),
    [members, deptId]
  );
  const deptManagers = useMemo(() => deptMembers.filter((m) => m.role === "manager"), [deptMembers]);
  const deptAgents = useMemo(() => deptMembers.filter((m) => m.role === "team"), [deptMembers]);

  // Categories linked to a department lock the target: "Billing" tickets can
  // only go to the Billing department (server enforces this too).
  const linkedDept = useMemo(
    () =>
      categories.find((c) => c.slug === ticketCategory)?.departmentId ?? null,
    [categories, ticketCategory]
  );

  useEffect(() => {
    if (open && linkedDept?._id) {
      setDeptId(linkedDept._id);
    }
  }, [open, linkedDept]);

  const handleSend = async () => {
    if (!deptId) {
      toast({ title: "Select a department first", variant: "destructive" });
      return;
    }
    if (direction === "agent" && !agentId) {
      toast({ title: "Select the agent to send to", variant: "destructive" });
      return;
    }
    setIsSending(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction,
          toDepartmentId: deptId,
          toUserId: direction === "agent" ? agentId : null,
          priority,
          note: note || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to send");
      toast({
        title: "Ticket sent",
        description:
          direction === "agent"
            ? "Waiting for the receiving manager's approval before it reaches the agent."
            : "The receiving manager will assign it to a team member.",
      });
      onSent();
      onClose();
    } catch (err) {
      toast({
        title: "Send failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 text-primary" aria-hidden />
            Send {ticketNumber} to another team
          </DialogTitle>
          <DialogDescription>
            The priority you set here is locked for the receiving side — they can read it but not
            change it.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="transfer-dept">Target department</Label>
              {linkedDept ? (
                // Category-locked target — shown, not chosen.
                <div className="flex h-9 items-center rounded-md border border-border bg-muted/40 px-3 text-sm font-medium">
                  {linkedDept.name}
                  <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-normal text-muted-foreground">
                    fixed by category
                  </span>
                </div>
              ) : (
                <Select
                  value={deptId}
                  onValueChange={(v) => {
                    setDeptId(v);
                    setAgentId("");
                  }}
                >
                  <SelectTrigger id="transfer-dept">
                    <SelectValue placeholder="Choose department…" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label>Send to</Label>
              {managerOnly ? (
                // Super admins cannot address agents directly — the receiving
                // manager always assigns a team member themselves.
                <p className="text-xs text-muted-foreground">
                  Sent to the department&apos;s manager, who will assign it to a team member.
                </p>
              ) : (
                <>
                  <div className="flex gap-2" role="group" aria-label="Recipient mode">
                    <Button
                      type="button"
                      variant={direction === "agent" ? "secondary" : "outline"}
                      size="sm"
                      className="flex-1"
                      onClick={() => setDirection("agent")}
                      disabled={!deptId}
                    >
                      A specific agent
                    </Button>
                    <Button
                      type="button"
                      variant={direction === "manager" ? "secondary" : "outline"}
                      size="sm"
                      className="flex-1"
                      onClick={() => setDirection("manager")}
                      disabled={!deptId}
                    >
                      The manager
                    </Button>
                  </div>
                  {direction === "agent" && (
                    <p className="text-xs text-muted-foreground">
                      Lands on the manager&apos;s dashboard first — the agent gets it after approval.
                    </p>
                  )}
                  {direction === "manager" && (
                    <p className="text-xs text-muted-foreground">
                      The manager will assign it to a member of their team.
                    </p>
                  )}
                </>
              )}
            </div>

            {direction === "agent" && (
              <div className="space-y-2">
                <Label htmlFor="transfer-agent">Agent</Label>
                <Select value={agentId} onValueChange={setAgentId} disabled={!deptId}>
                  <SelectTrigger id="transfer-agent">
                    <SelectValue placeholder={deptId ? "Choose agent…" : "Pick a department first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {deptAgents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                    {deptAgents.length === 0 && deptManagers.length === 0 && deptId && (
                      <SelectItem value="__none__" disabled>
                        No agents in this department
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="transfer-priority">Priority (set by you, locked for receivers)</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger id="transfer-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["low", "medium", "high", "urgent"].map((p) => (
                    <SelectItem key={p} value={p}>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="transfer-note">Note (optional)</Label>
              <Textarea
                id="transfer-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Context for the receiving team…"
                rows={3}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              {linkedDept
                ? `This ticket's "${ticketCategory}" category belongs to the ${linkedDept.name} department — it will be sent there for approval.`
                : "Categories are managed by the super admin — transfers don't change the ticket's category."}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSending}>
            Cancel
          </Button>
          <Button onClick={handleSend} loading={isSending} disabled={!deptId || (direction === "agent" && !agentId)}>
            Send ticket
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
