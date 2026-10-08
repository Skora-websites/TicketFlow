"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bot,
  Cpu,
  Inbox,
  Pencil,
  Pause,
  Play,
  Plus,
  Power,
  Sparkles,
  Trash2,
  Users,
  Zap,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { RuleFlowDiagram } from "@/components/routing/RuleFlowDiagram";
import { RuleBuilder } from "@/components/routing/RuleBuilder";
import { AgentCapacityBoard } from "@/components/routing/AgentCapacityBoard";
import { LivePreviewPanel } from "@/components/routing/LivePreviewPanel";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

interface Rule {
  _id: string;
  name: string;
  description?: string;
  priority: number;
  matchType: "any" | "all";
  conditions: { field: string; operator: string; value: any }[];
  actions: { type: string; targetId?: string; value?: string }[];
  status: "active" | "paused" | "draft";
  stats: { matchCount: number; lastMatchedAt?: Date };
}

interface DepartmentLite { id: string; name: string; color: string }
interface UserLite {
  userId: string;
  name: string;
  email: string;
  role: string;
  department: DepartmentLite | null;
  status: string;
  capacity: number;
  currentLoad: number;
  skills: string[];
}

export function RoutingDashboardContent() {
  const { toast } = useToast();
  const [tab, setTab] = useState("rules");
  const [rules, setRules] = useState<Rule[]>([]);
  const [users, setUsers] = useState<UserLite[]>([]);
  const [departments, setDepartments] = useState<DepartmentLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Rule | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    setError("");
    try {
      const [rulesRes, agentsRes] = await Promise.all([
        fetch("/api/routing/rules"),
        fetch("/api/routing/agents"),
      ]);
      if (!rulesRes.ok || !agentsRes.ok) throw new Error("Failed to load routing data");
      const rulesData = await rulesRes.json();
      const agentsData = await agentsRes.json();
      setRules(rulesData.rules ?? []);
      setUsers(agentsData.agents ?? []);
      setDepartments(agentsData.departments ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load routing data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const userLookup = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of users) map[u.userId] = u.name;
    return map;
  }, [users]);

  const departmentLookup = useMemo(() => {
    const map: Record<string, string> = {};
    for (const d of departments) map[d.id] = d.name;
    return map;
  }, [departments]);

  const stats = useMemo(() => {
    const active = rules.filter((r) => r.status === "active").length;
    const paused = rules.filter((r) => r.status === "paused").length;
    const draft = rules.filter((r) => r.status === "draft").length;
    const totalMatches = rules.reduce((sum, r) => sum + (r.stats?.matchCount ?? 0), 0);
    const onlineAgents = users.filter((u) => u.status === "available").length;
    const totalCapacity = users.reduce((s, u) => s + u.capacity, 0);
    const totalLoad = users.reduce((s, u) => s + u.currentLoad, 0);
    return { active, paused, draft, totalMatches, onlineAgents, totalCapacity, totalLoad };
  }, [rules, users]);

  const toggleRuleStatus = async (rule: Rule) => {
    const next = rule.status === "active" ? "paused" : "active";
    try {
      const res = await fetch(`/api/routing/rules/${rule._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error();
      toast({ title: `Rule ${next === "active" ? "activated" : "paused"}` });
      fetchAll();
    } catch {
      toast({ title: "Failed to update rule status", variant: "destructive" });
    }
  };

  const deleteRule = (rule: Rule) => {
    setDeleteTarget(rule);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/routing/rules/${deleteTarget._id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast({ title: "Rule deleted" });
      fetchAll();
    } catch {
      toast({ title: "Failed to delete rule", variant: "destructive" });
    } finally {
      setDeleteTarget(null);
    }
  };

  const startEdit = (rule: Rule) => {
    setEditingRule(rule);
    setBuilderOpen(true);
  };

  if (loading) {
    return (
      <div className="space-y-6" aria-label="Loading routing" aria-busy="true">
        <div>
          <div className="h-9 w-64 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-4 w-96 animate-pulse rounded bg-muted" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                <div className="mt-2 h-8 w-1/3 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="h-64 animate-pulse bg-muted" />
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-center">
          <Zap className="mx-auto mb-3 h-10 w-10 text-destructive" aria-hidden />
          <p className="font-medium">{error}</p>
          <Button variant="outline" className="mt-4" onClick={fetchAll}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Cpu className="h-4 w-4 text-primary" aria-hidden />
            Routing engine
            <Badge variant="success" className="gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
              Online
            </Badge>
          </p>
          <h1 className="page-header-title mt-2">Automated Ticket Routing</h1>
          <p className="page-header-sub max-w-2xl">
            Rules dispatch incoming tickets to the right agent or team based on keywords,
            category, and live agent capacity. Manual overrides remain available on every ticket.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingRule(null);
            setBuilderOpen(true);
          }}
        >
          <Plus className="h-4 w-4" aria-hidden /> New Rule
        </Button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          icon={<Zap className="h-5 w-5 text-success" aria-hidden />}
          label="Active rules"
          value={stats.active.toString()}
          subtext={`${stats.draft} draft · ${stats.paused} paused`}
        />
        <KpiCard
          icon={<Activity className="h-5 w-5 text-info" aria-hidden />}
          label="Routes fired"
          value={stats.totalMatches.toString()}
          subtext="across all active rules"
        />
        <KpiCard
          icon={<Power className="h-5 w-5 text-primary" aria-hidden />}
          label="Agents online"
          value={`${stats.onlineAgents}/${users.length}`}
          subtext={`${stats.totalLoad} of ${stats.totalCapacity} capacity used`}
        />
        <KpiCard
          icon={<Bot className="h-5 w-5 text-warning" aria-hidden />}
          label="Capacity used"
          value={`${stats.totalCapacity > 0 ? Math.min(100, Math.round((stats.totalLoad / Math.max(1, stats.totalCapacity)) * 100)) : 0}%`}
          subtext="current capacity utilization"
        />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} aria-label="Routing sections">
        <TabsList>
          <TabsTrigger value="rules" className="gap-1.5">
            <Zap className="h-3.5 w-3.5" aria-hidden /> Rules
          </TabsTrigger>
          <TabsTrigger value="preview" className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> Live Preview
          </TabsTrigger>
          <TabsTrigger value="agents" className="gap-1.5">
            <Users className="h-3.5 w-3.5" aria-hidden /> Agent Capacity
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="mt-4 space-y-4">
          {rules.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Inbox className="mx-auto mb-3 h-10 w-10 text-muted-foreground" aria-hidden />
                <p className="font-medium">No routing rules yet</p>
                <p className="mb-4 text-sm text-muted-foreground">
                  Create your first rule to start auto-assigning tickets.
                </p>
                <Button
                  onClick={() => {
                    setEditingRule(null);
                    setBuilderOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" aria-hidden /> Create Rule
                </Button>
              </CardContent>
            </Card>
          ) : (
            rules.map((rule) => (
              <div key={rule._id} className="space-y-2">
                <RuleFlowDiagram
                  rule={rule}
                  userLookup={userLookup}
                  departmentLookup={departmentLookup}
                />
                <div className="flex flex-col gap-2 px-1 sm:flex-row sm:items-center sm:justify-between">
                  <p className="font-mono text-xs text-muted-foreground">
                    Matched {rule.stats?.matchCount ?? 0}×
                    {rule.stats?.lastMatchedAt &&
                      ` · last ${new Date(rule.stats.lastMatchedAt).toLocaleString()}`}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <Button variant="ghost" size="sm" onClick={() => toggleRuleStatus(rule)}>
                      {rule.status === "active" ? (
                        <>
                          <Pause className="h-3.5 w-3.5" aria-hidden /> Pause
                        </>
                      ) : (
                        <>
                          <Play className="h-3.5 w-3.5" aria-hidden /> Activate
                        </>
                      )}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => startEdit(rule)}>
                      <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteRule(rule)}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="preview" className="mt-4">
          <LivePreviewPanel userLookup={userLookup} departmentLookup={departmentLookup} />
        </TabsContent>

        <TabsContent value="agents" className="mt-4 space-y-4">
          <Card>
            <CardContent className="flex flex-wrap items-center gap-3 p-4">
              <Users className="h-4 w-4 text-info" aria-hidden />
              <p className="text-sm font-medium">Agent fleet</p>
              <p className="text-sm text-muted-foreground">
                Toggle status, tune capacity, and tag skills. Routing uses these signals in real time.
              </p>
              <Button variant="outline" size="sm" onClick={fetchAll} className="ml-auto">
                Refresh
              </Button>
            </CardContent>
          </Card>
          <AgentCapacityBoard agents={users} onChange={fetchAll} />
        </TabsContent>
      </Tabs>

      <RuleBuilder
        open={builderOpen}
        onClose={() => setBuilderOpen(false)}
        onSaved={fetchAll}
        ruleId={editingRule?._id}
        departments={departments}
        users={users}
        initial={
          editingRule
            ? {
                name: editingRule.name,
                description: editingRule.description ?? "",
                priority: editingRule.priority,
                matchType: editingRule.matchType,
                status: editingRule.status,
                conditions: editingRule.conditions.map((c) => ({
                  id: Math.random().toString(36).slice(2, 10),
                  field: c.field as any,
                  operator: c.operator as any,
                  value: Array.isArray(c.value) ? c.value.join(", ") : String(c.value ?? ""),
                  caseSensitive: (c as any).caseSensitive ?? false,
                })),
                actions: editingRule.actions.map((a) => ({
                  id: Math.random().toString(36).slice(2, 10),
                  type: a.type as any,
                  targetId: a.targetId ?? "",
                  value: a.value ?? "",
                })),
              }
            : undefined
        }
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete rule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  subtext,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtext?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          {icon}
        </div>
        <p className={cn("font-mono text-2xl font-bold sm:text-3xl")}>{value}</p>
        {subtext && <p className="mt-1 text-xs text-muted-foreground">{subtext}</p>}
      </CardContent>
    </Card>
  );
}
