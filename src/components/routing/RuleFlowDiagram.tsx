"use client";

import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Tone = "active" | "paused" | "draft";

interface RuleFlowDiagramProps {
  rule: {
    _id: string;
    name: string;
    matchType: "any" | "all";
    conditions: { field: string; operator: string; value: any }[];
    actions: { type: string; targetId?: string; value?: string }[];
    status: Tone;
    priority: number;
  };
  departmentLookup?: Record<string, string>;
  userLookup?: Record<string, string>;
  compact?: boolean;
}

const FIELD_LABEL: Record<string, string> = {
  keyword: "Keyword",
  category: "Category",
  priority: "Priority",
  requester: "Requester",
};

const ACTION_LABEL: Record<string, string> = {
  assign_user: "Assign",
  assign_department: "Team",
  set_priority: "Priority",
  set_status: "Status",
};

const statusVariant: Record<Tone, "success" | "warning" | "subtle"> = {
  active: "success",
  paused: "warning",
  draft: "subtle",
};

export function RuleFlowDiagram({
  rule,
  departmentLookup = {},
  userLookup = {},
  compact = false,
}: RuleFlowDiagramProps) {
  const conditions = rule.conditions || [];
  const actions = rule.actions || [];
  const assigneeAction = actions.find((a) => a.type === "assign_user");
  const deptAction = actions.find((a) => a.type === "assign_department");
  const targetName = assigneeAction
    ? (userLookup[assigneeAction.targetId ?? ""] ?? "agent")
    : deptAction
      ? `${departmentLookup[deptAction.targetId ?? ""] ?? "team"} pool`
      : "fallback agent";

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div className="min-w-0">
          <p className="font-mono text-xs text-muted-foreground">
            Rule · Priority {rule.priority}
          </p>
          <h3 className="truncate font-semibold">{rule.name}</h3>
        </div>
        <Badge variant={statusVariant[rule.status]} className="shrink-0 capitalize">
          {rule.status}
        </Badge>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-1 items-stretch gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
          {/* Conditions */}
          <Node label={`When · match ${rule.matchType}`}>
            <div className="flex flex-col gap-2">
              {conditions.map((c, idx) => (
                <div key={idx} className="flex items-center gap-2 text-xs">
                  <span className="w-5 shrink-0 font-mono text-[11px] text-muted-foreground">
                    #{idx + 1}
                  </span>
                  <Badge variant="secondary" className="gap-1.5 font-mono font-normal">
                    <span className="font-semibold">
                      {FIELD_LABEL[c.field] ?? c.field}
                    </span>
                    <span className="opacity-60">{c.operator}</span>
                    <span className="max-w-[120px] truncate text-foreground">
                      {Array.isArray(c.value)
                        ? c.value.join(" · ")
                        : c.field === "keyword"
                          ? `"${c.value}"`
                          : String(c.value)}
                    </span>
                  </Badge>
                </div>
              ))}
            </div>
          </Node>

          <Connector label={rule.matchType === "all" ? "AND" : "OR"} />

          {/* Actions */}
          <Node label="Route to">
            <div className="flex flex-col gap-2">
              {actions.map((a, idx) => {
                const target = a.targetId
                  ? a.type === "assign_department"
                    ? (departmentLookup[a.targetId] ?? "Department")
                    : a.type === "assign_user"
                      ? (userLookup[a.targetId] ?? "Agent")
                      : ""
                  : "";
                return (
                  <div key={idx} className="flex items-center gap-2 text-xs">
                    <span className="w-5 shrink-0 font-mono text-[11px] text-muted-foreground">
                      #{idx + 1}
                    </span>
                    <Badge variant="info" className="gap-1.5 font-mono font-normal">
                      <span className="font-semibold">
                        {ACTION_LABEL[a.type] ?? a.type}
                      </span>
                      <span className="max-w-[140px] truncate">{target || a.value || "—"}</span>
                    </Badge>
                  </div>
                );
              })}
            </div>
          </Node>

          <Connector label="→" />

          {/* Outcome */}
          <Node label="Outcome">
            <p className="font-mono text-xs">
              {rule.matchType === "all" ? "ALL" : "ANY"} · {conditions.length} condition
              {conditions.length === 1 ? "" : "s"}
            </p>
            {!compact && (
              <p className="mt-2 text-xs leading-snug text-muted-foreground">
                Auto-assigns incoming tickets to <span className="font-medium text-foreground">{targetName}</span>.
              </p>
            )}
          </Node>
        </div>
      </CardContent>
    </Card>
  );
}

function Node({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

function Connector({ label }: { label: string }) {
  return (
    <div className="hidden min-w-[36px] items-center justify-center md:flex" aria-hidden>
      {label === "→" ? (
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
      ) : (
        <span
          className={cn(
            "rounded border border-border bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground"
          )}
        >
          {label}
        </span>
      )}
    </div>
  );
}
