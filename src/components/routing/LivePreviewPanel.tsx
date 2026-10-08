"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles, ChevronRight, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useCategories } from "@/hooks/use-categories";
import { cn } from "@/lib/utils";

interface PreviewInput {
  title: string;
  description: string;
  category: string;
  priority: "low" | "medium" | "high" | "urgent";
}

interface PreviewDecision {
  ruleId?: string;
  ruleName?: string;
  matchedConditions: number;
  totalConditions: number;
  assigneeId?: string;
  assigneeName?: string;
  departmentId?: string;
  departmentName?: string;
  reason: string;
  confidence: number;
  evaluatedRules: number;
  actions: { type: string; targetId?: string; value?: string }[];
}

interface LivePreviewPanelProps {
  userLookup?: Record<string, string>;
  departmentLookup?: Record<string, string>;
}

const SAMPLES: { label: string; input: PreviewInput }[] = [
  {
    label: "Login bug on iOS",
    input: {
      title: "Login page crashes on iOS Safari",
      description: "Users report the login button throws an error on iOS 17. Looks like a session cookie issue.",
      category: "development",
      priority: "high",
    },
  },
  {
    label: "Salesforce sync",
    input: {
      title: "Salesforce integration not syncing new leads",
      description: "Deals created in our CRM aren't appearing in Salesforce. Critical for the sales pipeline.",
      category: "other",
      priority: "urgent",
    },
  },
  {
    label: "Marketing landing page",
    input: {
      title: "Build Q4 campaign landing page with lead capture",
      description: "Need a new marketing landing page for the upcoming launch. Should integrate with HubSpot.",
      category: "marketing",
      priority: "medium",
    },
  },
];

export function LivePreviewPanel({ userLookup = {}, departmentLookup = {} }: LivePreviewPanelProps) {
  const [input, setInput] = useState<PreviewInput>(SAMPLES[0].input);
  const [decision, setDecision] = useState<PreviewDecision | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { categories } = useCategories();

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/routing/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to evaluate");
        }
        const data = await res.json();
        if (!cancelled) setDecision(data.decision as PreviewDecision);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Routing evaluation failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    // Debounce a bit so typing feels smooth
    const t = setTimeout(run, 280);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [input]);

  const matched = decision?.matchedConditions ?? 0;
  const total = decision?.totalConditions ?? 0;
  const confidencePct = useMemo(() => Math.round((decision?.confidence ?? 0) * 100), [decision]);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden />
          Live Routing Preview
        </CardTitle>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Sample tickets">
          {SAMPLES.map((s) => (
            <Button
              key={s.label}
              type="button"
              variant={input.title === s.input.title ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setInput(s.input)}
              className="h-7 text-xs"
            >
              {s.label}
            </Button>
          ))}
        </div>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_1fr]">
          {/* Input side */}
          <div className="space-y-3">
            <div>
              <Label htmlFor="preview-title" className="mb-1.5 block">Title</Label>
              <Input
                id="preview-title"
                value={input.title}
                onChange={(e) => setInput({ ...input, title: e.target.value })}
                placeholder="Brief summary"
              />
            </div>
            <div>
              <Label htmlFor="preview-description" className="mb-1.5 block">Description</Label>
              <Textarea
                id="preview-description"
                value={input.description}
                onChange={(e) => setInput({ ...input, description: e.target.value })}
                placeholder="What's happening?"
                className="min-h-[88px] resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1.5 block" htmlFor="preview-category">Category</Label>
                <Select
                  value={input.category}
                  onValueChange={(v) => setInput({ ...input, category: v as PreviewInput["category"] })}
                >
                  <SelectTrigger id="preview-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.slug} value={c.slug}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1.5 block" htmlFor="preview-priority">Priority</Label>
                <Select
                  value={input.priority}
                  onValueChange={(v) => setInput({ ...input, priority: v as PreviewInput["priority"] })}
                >
                  <SelectTrigger id="preview-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Decision side */}
          <div className="relative rounded-lg border border-border bg-muted/40 p-3 sm:p-4">
            {loading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/50">
                <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
              </div>
            )}

            {error ? (
              <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
                <AlertTriangle className="h-4 w-4" aria-hidden /> {error}
              </p>
            ) : decision ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Rule evaluated
                  </p>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {decision.evaluatedRules} rule{decision.evaluatedRules === 1 ? "" : "s"} scanned
                  </span>
                </div>

                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Matched rule
                  </p>
                  <p className="mt-1 font-medium">
                    {decision.ruleName ?? (
                      <span className="text-muted-foreground">No rule matched · fallback will apply</span>
                    )}
                  </p>
                  {decision.ruleId && (
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                      {decision.ruleId}
                    </p>
                  )}
                  {decision.ruleId && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Conditions
                      </span>
                      <span className="font-mono text-xs">
                        <span className="text-success">{matched}</span>
                        <span className="text-muted-foreground"> / {total}</span>
                      </span>
                      <Progress
                        value={total === 0 ? 0 : (matched / total) * 100}
                        className="h-1 flex-1"
                        aria-label={`${matched} of ${total} conditions matched`}
                      />
                    </div>
                  )}
                </div>

                {/* Routing trail */}
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Routing actions
                  </p>
                  <RouteStep
                    label="Incoming"
                    value={`${input.category} · ${input.priority}`}
                  />
                  <RouteArrow />
                  {decision.actions.map((a, i) => (
                    <RouteStep
                      key={i}
                      label={a.type.replace("_", " ")}
                      value={
                        a.targetId
                          ? a.type === "assign_department"
                            ? (departmentLookup[a.targetId] ?? a.targetId)
                            : (userLookup[a.targetId] ?? a.targetId)
                          : (a.value ?? "—")
                      }
                    />
                  ))}
                  <RouteArrow />
                  <RouteStep
                    label="Assigned to"
                    value={
                      decision.assigneeName
                        ? `${decision.assigneeName}${decision.departmentName ? ` · ${decision.departmentName}` : ""}`
                        : decision.departmentName
                          ? `${decision.departmentName} (no agent)`
                          : "Unassigned (awaiting manual override)"
                    }
                    highlight
                  />
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-border pt-2">
                  <Badge variant="secondary" className="font-mono font-normal">
                    Confidence {confidencePct}%
                  </Badge>
                  <p className="max-w-[60%] text-right text-xs leading-snug text-muted-foreground">
                    {decision.reason}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RouteStep({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-lg border px-3 py-2",
        highlight ? "border-primary/30 bg-primary/5" : "border-border bg-card"
      )}
    >
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="truncate font-mono text-xs">{value}</span>
    </div>
  );
}

function RouteArrow() {
  return (
    <div className="flex items-center justify-center py-0.5" aria-hidden>
      <ChevronRight className="h-3.5 w-3.5 rotate-90 text-muted-foreground" />
    </div>
  );
}
