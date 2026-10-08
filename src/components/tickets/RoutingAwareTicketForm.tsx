"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";
import { TicketForm } from "@/components/tickets";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function RoutingAwareTicketForm() {
  const router = useRouter();
  const { toast } = useToast();

  const handleSubmit = async (data: any, attachments?: File[]) => {
    const form = new FormData();
    form.set("title", data.title ?? "");
    form.set("description", data.description ?? "");
    form.set("category", data.category ?? "");
    form.set("priority", data.priority ?? "");
    if (data.departmentId) form.set("departmentId", data.departmentId);
    if (data.assigneeId) form.set("assigneeId", data.assigneeId);
    for (const file of attachments ?? []) {
      if (file.size > 0) form.append("attachment", file);
    }

    const res = await fetch("/api/tickets", {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to create ticket");
    }
    const result = await res.json();
    if (result.routingApplied && result.ticket?.assigneeId) {
      toast({
        title: "Auto-routed",
        description: `Assigned to ${result.ticket.assigneeId.name ?? "an agent"}.`,
      });
    } else {
      toast({ title: "Ticket created", description: "Awaiting manual assignment." });
    }
    router.push(`/dashboard/tickets/${result.ticket._id}`);
    router.refresh();
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/tickets">
          <Button variant="ghost" size="icon" className="h-10 w-10">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-foreground">New Ticket</h1>
          <p className="text-muted-foreground mt-1">
            Tickets are routed automatically. You can override the assignee after creation.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <TicketForm onSubmit={handleSubmit} submitLabel="Create Ticket" />
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-border/50 bg-card p-5 sticky top-20">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-primary" />
              <h2 className="font-semibold">How routing works</h2>
            </div>
            <ol className="space-y-3 text-sm">
              <Step
                n={1}
                title="Match"
                body="The engine scans active rules in priority order and evaluates conditions against the title, description, category, priority, and requester."
              />
              <Step
                n={2}
                title="Score agents"
                body="Each candidate agent is scored by skill overlap, availability, and capacity headroom. Offline and overloaded agents are penalised."
              />
              <Step
                n={3}
                title="Assign or escalate"
                body="Tickets are auto-assigned to the best agent or fall back to a department pool. Managers can reassign with one click after creation."
              />
            </ol>
            <div className="pt-4 mt-4 border-t border-border text-xs text-muted-foreground">
              <Link href="/dashboard/routing" className="text-primary hover:underline">
                Configure routing rules →
              </Link>
            </div>
          </div>

          <div className="rounded-xl border border-border/50 bg-card p-5">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Default fallbacks</p>
            <ul className="space-y-2 text-xs">
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">No rule matches</span>
                <span>Lightest available agent</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">Department empty</span>
                <span>Cross-team best match</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">No agent available</span>
                <span>Manual queue</span>
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">
        {n}
      </span>
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        <p className="text-xs text-muted-foreground leading-snug">{body}</p>
      </div>
    </li>
  );
}
