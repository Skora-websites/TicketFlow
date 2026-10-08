"use client";

import { useState } from "react";
import { Loader2, Settings2, Minus, Plus } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { UserAvatar } from "@/components/tickets";
import { cn } from "@/lib/utils";

interface Agent {
  userId: string;
  name: string;
  email: string;
  role: string;
  department: { id: string; name: string; color: string } | null;
  status: string;
  capacity: number;
  currentLoad: number;
  skills: string[];
}

interface AgentCapacityBoardProps {
  agents: Agent[];
  onChange: () => void;
}

const STATUSES: ("available" | "busy" | "away" | "offline")[] = ["available", "busy", "away", "offline"];

const statusVariant: Record<string, "success" | "warning" | "subtle"> = {
  available: "success",
  busy: "warning",
  away: "warning",
  offline: "subtle",
};

export function AgentCapacityBoard({ agents, onChange }: AgentCapacityBoardProps) {
  if (agents.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <p className="font-medium">No agents found</p>
          <p className="text-sm text-muted-foreground">
            Agents appear here once team members join.
          </p>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {agents.map((agent) => (
        <AgentCard key={agent.userId} agent={agent} onChange={onChange} />
      ))}
    </div>
  );
}

function AgentCard({ agent, onChange }: { agent: Agent; onChange: () => void }) {
  const { toast } = useToast();
  const [updating, setUpdating] = useState(false);
  const [skillDraft, setSkillDraft] = useState("");
  const [showSkills, setShowSkills] = useState(false);

  const loadPct = Math.min(100, Math.round((agent.currentLoad / Math.max(1, agent.capacity)) * 100));

  const patch = async (body: Record<string, unknown>, successTitle?: string) => {
    setUpdating(true);
    try {
      const res = await fetch("/api/routing/agents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: agent.userId, ...body }),
      });
      if (!res.ok) throw new Error();
      if (successTitle) toast({ title: successTitle });
      onChange();
    } catch {
      toast({ title: "Update failed", variant: "destructive" });
    } finally {
      setUpdating(false);
    }
  };

  const setStatus = (status: "available" | "busy" | "away" | "offline") =>
    patch({ status }, `${agent.name} set to ${status}`);

  const setCapacity = (capacity: number) =>
    patch({ capacity: Math.max(0, Math.min(100, capacity)) });

  const addSkill = () => {
    const skill = skillDraft.trim().toLowerCase();
    if (!skill) return;
    const next = Array.from(new Set([...(agent.skills ?? []), skill]));
    setSkillDraft("");
    patch({ skills: next });
  };

  const removeSkill = (skill: string) => {
    const next = (agent.skills ?? []).filter((s) => s !== skill);
    patch({ skills: next });
  };

  return (
    <Card className="relative">
      {updating && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/50">
          <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
        </div>
      )}

      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <UserAvatar name={agent.name} email={agent.email} role={agent.role} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{agent.name}</p>
            <p className="truncate text-xs text-muted-foreground">{agent.email}</p>
          </div>
          <Badge variant={statusVariant[agent.status] ?? "subtle"} className="shrink-0 capitalize">
            {agent.status}
          </Badge>
        </div>

        {agent.department && (
          <p className="text-xs text-muted-foreground">
            {agent.department.name} · <span className="capitalize">{agent.role.replace("_", " ")}</span>
          </p>
        )}

        {/* Status selector */}
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Status
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {STATUSES.map((s) => (
              <Button
                key={s}
                type="button"
                variant={agent.status === s ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setStatus(s)}
                disabled={updating}
                className="h-7 px-2 text-xs capitalize"
              >
                {s}
              </Button>
            ))}
          </div>
        </div>

        {/* Capacity */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Capacity
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{agent.currentLoad}</span>
              {" / "}{agent.capacity} · {loadPct}%
            </p>
          </div>
          <Progress value={loadPct} className="h-2" aria-label={`${agent.name} capacity ${loadPct}%`} />
          <div className="mt-2 flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => setCapacity(agent.capacity - 1)}
              disabled={updating}
              aria-label="Decrease capacity"
            >
              <Minus className="h-3.5 w-3.5" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => setCapacity(agent.capacity + 1)}
              disabled={updating}
              aria-label="Increase capacity"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>
        </div>

        {/* Skills */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Skills
            </p>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setShowSkills((v) => !v)}
              aria-label="Toggle skill editor"
              aria-expanded={showSkills}
            >
              <Settings2 className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(agent.skills ?? []).length === 0 && (
              <span className="text-xs text-muted-foreground">No skills tagged</span>
            )}
            {(agent.skills ?? []).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => removeSkill(s)}
                disabled={updating}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-0.5 font-mono text-xs text-secondary-foreground transition-colors",
                  "hover:border-destructive/40 hover:text-destructive"
                )}
                title={`Remove skill ${s}`}
              >
                {s}
              </button>
            ))}
          </div>
          {showSkills && (
            <div className="mt-2 flex items-center gap-2">
              <Input
                value={skillDraft}
                onChange={(e) => setSkillDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSkill())}
                placeholder="e.g. billing, ios"
                className="h-8 font-mono text-xs"
                aria-label="New skill"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addSkill}
                disabled={updating || !skillDraft.trim()}
              >
                Add
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
