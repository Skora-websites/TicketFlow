"use client";

import Link from "next/link";
import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TicketList, ticketHref, TicketCardSkeleton } from "@/components/tickets";
import { Skeleton } from "@/components/ui/skeleton";
import { IncomingTransfersCard } from "./IncomingTransfersCard";
import { formatAvgResolution } from "@/lib/formatAvgResolution";
import { TRANSFERS_ENABLED } from "@/lib/features";
import ActivityHeatmap, { type ActivityDay } from "@/components/ui/activity-heatmap";
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Inbox,
  Clock,
  PauseCircle,
  Layers,
  CheckCircle2,
  Plus,
  TicketPlus,
  ArrowRight,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { cn } from "@/lib/utils";
import { statusColors, priorityColors } from "@/lib/charts";
import { ChartTooltip } from "@/components/charts/ChartTooltip";

interface ChartCardProps {
  title: string;
  description?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

function ChartCard({ title, description, badge, children, className }: ChartCardProps) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card p-5 shadow-xs", className)}>
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-[15px] font-bold text-foreground tracking-tight">{title}</h3>
          {badge}
        </div>
        {description && <p className="text-[12px] text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div>{children}</div>
    </div>
  );
}

export function OverviewContent() {
  const { data: session } = useSession();
  const role = session?.user?.role as string | undefined;
  // Team/org-level cards render for managers + super admins only; agents get
  // the personal scope everywhere (per spec, the agent overview shows only
  // the agent's own data).
  const isManagerial = role === "manager" || role === "super_admin";
  // Org-wide department chart is a super-admin-only view (per spec).
  const isSuperAdmin = role === "super_admin";
  // Bumped by the incoming-transfers card after approve/reject so the stats
  // grid re-fetches (approving moves tickets between departments/queues).
  const [statsVersion, setStatsVersion] = useState(0);
  const [stats, setStats] = useState({
    overview: {
      total: 0,
      open: 0,
      in_progress: 0,
      on_hold: 0,
      resolved: 0,
      closed: 0,
      unassigned: 0,
      avgResolutionDays: 0,
      avgResolutionHours: 0,
    },
    charts: {
      byStatus: [] as { status: string; count: number }[],
      byPriority: [] as { priority: string; count: number }[],
      byDepartment: [] as { department: string; count: number }[],
      weeklyTrend: [] as { week: string; count: number }[],
    },
    workload: [] as {
      user: { name: string };
      open: number;
      in_progress: number;
      on_hold: number;
      total: number;
    }[],
    contributions: [] as { date: string; count: number }[],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [recentTickets, setRecentTickets] = useState<any[]>([]);
  const [selectedHeatmapDate, setSelectedHeatmapDate] = useState<string | null>(null);

  const userActivityDays = useMemo<ActivityDay[]>(() => {
    if (stats.contributions && stats.contributions.length > 0) {
      return stats.contributions;
    }
    const days: ActivityDay[] = [];
    const end = new Date();
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 364);

    for (let t = start.getTime(); t <= end.getTime(); t += 86_400_000) {
      const dateStr = new Date(t).toISOString().slice(0, 10);
      days.push({ date: dateStr, count: 0 });
    }
    return days;
  }, [stats.contributions]);

  const priorityChartData = useMemo(() => {
    // 5-color vibrant palette matching reference design
    const PRIORITY_THEME: Record<string, { label: string; fill: string }> = {
      urgent: { label: "Urgent", fill: "#F43F5E" },
      high: { label: "High", fill: "#F59E0B" },
      medium: { label: "Medium", fill: "#3B82F6" },
      low: { label: "Low", fill: "#10B981" },
      other: { label: "Other", fill: "#A855F7" },
    };

    if (!stats.charts.byPriority || stats.charts.byPriority.length === 0) return [];
    return stats.charts.byPriority
      .filter((item) => item.count > 0)
      .map((item) => {
        const key = (item.priority || "other").toLowerCase();
        const meta = PRIORITY_THEME[key] || {
          label: item.priority || "Other",
          fill: "#A855F7",
        };
        return {
          priority: key,
          label: meta.label,
          count: item.count,
          fill: meta.fill,
        };
      });
  }, [stats.charts.byPriority]);

  const totalPriorityTickets = useMemo(
    () => priorityChartData.reduce((sum, item) => sum + item.count, 0),
    [priorityChartData]
  );

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch("/api/stats");
        if (!res.ok) throw new Error("Failed to fetch stats");
        const data = await res.json();
        setStats(data);

        try {
          const tRes = await fetch("/api/tickets?limit=5");
          if (tRes.ok) {
            const tData = await tRes.json();
            setRecentTickets(tData.tickets ?? []);
          }
        } catch {
          // recent tickets are non-critical; ignore failure
        }

      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      } finally {
        setIsLoading(false);
      }
    }
    fetchStats();
  }, [statsVersion]);

  // Skeleton mirrors the role's real layout so the page doesn't shift when
  // data lands: same header, same horizontal metrics group, top banner quick create grid,
  // and role-specific charts/workload grid.
  if (isLoading) {
    return (
      <div className="space-y-6" aria-label="Loading dashboard" aria-busy="true">
        {/* Page Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between pb-1">
          <div>
            <Skeleton className="h-7 sm:h-8 w-32 rounded-lg" />
            <Skeleton className="mt-1.5 h-3.5 w-64 sm:w-80 rounded-md" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 flex-1 sm:flex-initial sm:w-28 rounded-xl" />
            <Skeleton className="h-8 flex-1 sm:flex-initial sm:w-28 rounded-xl" />
          </div>
        </div>

        {/* Shared Horizontal Metrics Group */}
        <div className="rounded-lg border border-border bg-card shadow-xs overflow-hidden">
          <div className="grid grid-cols-2 divide-y sm:divide-y-0 sm:grid-cols-3 lg:grid-cols-5 divide-border">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className={cn(
                  "p-3.5 sm:p-4",
                  i < 5 && "lg:border-r border-border",
                  i === 5 && "col-span-2 sm:col-span-1"
                )}
              >
                <Skeleton className="h-3 w-20 rounded" />
                <Skeleton className="mt-2 h-7 w-12 rounded" />
                <Skeleton className="mt-2 h-3 w-24 rounded" />
              </div>
            ))}
          </div>
        </div>

        {/* Top Banner & Quick Create Grid */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Dashed Action Card Skeleton */}
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#D4D4D8] dark:border-[#3F3F46] bg-white/40 dark:bg-[#1C1C20]/40 p-6 text-center">
            <Skeleton className="mb-3 h-14 w-14 rounded-2xl" />
            <Skeleton className="h-5 w-32 rounded-md" />
            <Skeleton className="mt-1.5 h-3.5 w-44 rounded-md" />
            <Skeleton className="mt-4 h-10 w-32 rounded-xl" />
          </div>

          {/* 2 Featured Active Ticket Cards in Tabela format */}
          <TicketCardSkeleton variant="default" />
          <TicketCardSkeleton variant="default" />
        </div>

        {/* Charts & Workload Grid */}
        <div className="grid gap-6 lg:grid-cols-2">
          {isManagerial && (
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div className="space-y-1">
                  <Skeleton className="h-5 w-40 rounded" />
                  <Skeleton className="h-3 w-48 rounded" />
                </div>
                <Skeleton className="h-8 w-20 rounded-xl" />
              </div>
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center justify-between rounded-xl border border-border/70 bg-secondary/30 p-3">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <div className="space-y-1.5">
                        <Skeleton className="h-3.5 w-24 rounded" />
                        <Skeleton className="h-3 w-32 rounded" />
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="hidden sm:flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((b) => (
                          <Skeleton key={b} className="h-2 w-3 rounded-xs" />
                        ))}
                      </div>
                      <Skeleton className="h-4 w-6 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isManagerial && (
            <Card className="rounded-2xl border-border shadow-sm">
              <CardHeader>
                <Skeleton className="h-5 w-36 rounded" />
                <Skeleton className="h-3 w-48 rounded mt-1" />
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <TicketCardSkeleton key={i} variant="compact" />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {isManagerial && (
            <Card className="rounded-2xl border-border shadow-sm">
              <CardHeader>
                <Skeleton className="h-5 w-36 rounded" />
                <Skeleton className="h-3 w-48 rounded mt-1" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-64 w-full rounded-xl" />
              </CardContent>
            </Card>
          )}

          {isSuperAdmin && (
            <>
              <Card className="rounded-2xl border-border shadow-sm">
                <CardHeader>
                  <Skeleton className="h-5 w-44 rounded" />
                  <Skeleton className="h-3 w-40 rounded mt-1" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-64 w-full rounded-xl" />
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-border shadow-sm">
                <CardHeader>
                  <Skeleton className="h-5 w-36 rounded" />
                  <Skeleton className="h-3 w-40 rounded mt-1" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-64 w-full rounded-xl" />
                </CardContent>
              </Card>
            </>
          )}

          {!isManagerial && (
            <>
              <Card className="rounded-2xl border-border shadow-sm">
                <CardHeader>
                  <Skeleton className="h-5 w-36 rounded" />
                  <Skeleton className="h-3 w-48 rounded mt-1" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <TicketCardSkeleton key={i} variant="compact" />
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-border shadow-sm">
                <CardHeader>
                  <Skeleton className="h-5 w-36 rounded" />
                  <Skeleton className="h-3 w-40 rounded mt-1" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-64 w-full rounded-xl" />
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Manager-only full width trend card */}
        {isManagerial && !isSuperAdmin && (
          <Card className="rounded-2xl border-border shadow-sm">
            <CardHeader>
              <Skeleton className="h-5 w-44 rounded" />
              <Skeleton className="h-3 w-48 rounded mt-1" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full rounded-xl" />
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">Failed to load dashboard</h2>
        <p className="text-muted-foreground mb-4">{error}</p>
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </div>
    );
  }

  const { overview, charts, workload } = stats;

  const resolutionRate = overview.total > 0
    ? Math.round(((overview.resolved + overview.closed) / overview.total) * 100)
    : 0;

  // Shared body so the trend can render in-grid (super admin row pair) or
  // full-width (manager/agent) without duplicating the chart JSX.
  const weeklyTrendBody = (
    <div className="h-64">
      {charts.weeklyTrend.length === 0 ? (
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-muted-foreground">Not enough history yet.</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={charts.weeklyTrend}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis
              dataKey="week"
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              tickFormatter={(value) => new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            />
            <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} />
            <Line
              type="monotone"
              dataKey="count"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Manager approval inbox: pending incoming inter-department transfers.
          Dormant while transfers are disabled (a ticket is non-transferable). */}
      {TRANSFERS_ENABLED && (
        <IncomingTransfersCard role={role} onChanged={() => setStatsVersion((v) => v + 1)} />
      )}

      {/* Page Header */}
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between pb-1">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Overview
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground" role="status">
            <span className="font-medium text-foreground">{overview.open} open tickets</span> requiring attention · Avg resolution:{" "}
            <span className="font-medium text-foreground">{formatAvgResolution(overview.avgResolutionDays, overview.avgResolutionHours)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/tickets" className="flex-1 sm:flex-initial">
            <Button variant="outline" size="sm" className="w-full sm:w-auto">View all tickets</Button>
          </Link>
          <Link href="/dashboard/tickets/new" className="flex-1 sm:flex-initial">
            <Button size="sm" className="w-full sm:w-auto">
              <Plus className="h-3.5 w-3.5" />
              New ticket
            </Button>
          </Link>
        </div>
      </div>

      {/* Shared Horizontal Metrics Group with hairline dividers (no floating individual cards) */}
      <div className="rounded-lg border border-border bg-card shadow-xs overflow-hidden">
        <div className="grid grid-cols-2 divide-y sm:divide-y-0 sm:grid-cols-3 lg:grid-cols-5 divide-border">
          {/* 1. Open Tickets */}
          <div className="p-3.5 sm:p-4 lg:border-r border-border">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Open tickets</p>
            <p className="mt-1.5 text-2xl font-bold tracking-tight text-foreground tabular-nums leading-none">
              {overview.open}
            </p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {overview.on_hold} on hold
            </p>
          </div>

          {/* 2. In Progress */}
          <div className="p-3.5 sm:p-4 lg:border-r border-border">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">In progress</p>
            <p className="mt-1.5 text-2xl font-bold tracking-tight text-foreground tabular-nums leading-none">
              {overview.in_progress}
            </p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {Math.round((overview.in_progress / Math.max(overview.total, 1)) * 100)}% of workload
            </p>
          </div>

          {/* 3. Unassigned / On Hold */}
          <div className="p-3.5 sm:p-4 lg:border-r border-border">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {isManagerial ? "Unassigned" : "On hold"}
            </p>
            <p className="mt-1.5 text-2xl font-bold tracking-tight text-foreground tabular-nums leading-none">
              {isManagerial ? overview.unassigned : overview.on_hold}
            </p>
            <p className="mt-2 text-[11px]">
              {isManagerial ? (
                overview.unassigned > 5 ? (
                  <span className="text-destructive font-medium">Needs attention</span>
                ) : (
                  <span className="text-muted-foreground">Queue clear</span>
                )
              ) : (
                <span className="text-muted-foreground">Pending input</span>
              )}
            </p>
          </div>

          {/* 4. Total Volume */}
          <div className="p-3.5 sm:p-4 lg:border-r border-border">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total volume</p>
            <p className="mt-1.5 text-2xl font-bold tracking-tight text-foreground tabular-nums leading-none">
              {overview.total}
            </p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {overview.open + overview.in_progress + overview.on_hold} active
            </p>
          </div>

          {/* 5. Resolution Rate */}
          <div className="col-span-2 sm:col-span-1 p-3.5 sm:p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Resolution rate</p>
            <p className="mt-1.5 text-2xl font-bold tracking-tight text-foreground tabular-nums leading-none">
              {overview.total > 0 ? Math.round(((overview.resolved + overview.closed) / overview.total) * 100) : 0}%
            </p>
            <p className="mt-2 text-[11px] text-success font-medium">
              {overview.resolved + overview.closed} resolved
            </p>
          </div>
        </div>
      </div>

      {/* Top Banner & Quick Create Grid */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Tabela Signature Dashed Action Card */}
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-card/60 p-6 text-center transition-all hover:bg-card hover:border-[#F399B3]/40">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-foreground shadow-2xs">
            <TicketPlus className="h-7 w-7 text-foreground" />
          </div>
          <h3 className="text-base font-bold text-foreground tracking-tight">Open New Ticket</h3>
          <p className="mt-1 max-w-[220px] text-xs text-muted-foreground">
            Quickly submit a customer inquiry or internal department task.
          </p>
          <Link href="/dashboard/tickets/new" className="mt-4">
            <Button variant="accent" className="h-10 px-5 text-xs font-bold">
              Create Ticket +
            </Button>
          </Link>
        </div>

        {/* 2 Featured Active Tickets styled in Tabela format */}
        {recentTickets.slice(0, 2).map((t) => (
          <div key={t._id} className="rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md">
            <div className="flex items-center justify-between border-b border-border/70 pb-3">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {t.ticketNumber}
              </span>
              <Badge variant="outline" className={cn(
                "rounded-full px-3 py-0.5 text-xs font-semibold",
                t.status === "open" && "status-open",
                t.status === "in_progress" && "status-in_progress",
                t.status === "on_hold" && "status-on_hold",
                t.status === "resolved" && "status-resolved",
                t.status === "closed" && "status-closed"
              )}>
                {t.status.replace("_", " ")}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-3">
              <div className="border-r border-border/70 pr-3 space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Customer</p>
                <p className="truncate text-xs font-semibold text-foreground">{t.requesterId?.name || "Customer"}</p>
                <p className="truncate text-[11px] text-muted-foreground">{t.requesterId?.email || "—"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Details</p>
                <h4 className="truncate text-xs font-bold text-foreground">{t.title}</h4>
                <p className="text-[11px] text-muted-foreground capitalize">Priority: <span className="font-semibold text-foreground">{t.priority}</span></p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-border/70 pt-3">
              <span className="text-[11px] font-mono text-muted-foreground">{t.category}</span>
              <Link href={ticketHref(t)}>
                <Button size="sm" className="h-8 rounded-xl bg-white px-3.5 text-xs font-bold text-[#121212] shadow-xs hover:bg-[#E9E7E8]">
                  View Ticket
                </Button>
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Charts grid — two cards per row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Team Workload with Tabela 5-segment bars */}
        {isManagerial && workload.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-foreground tracking-tight">Active Team Workload</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Capacity distribution across team members</p>
              </div>
              <Link href="/dashboard/workload">
                <Button variant="outline" size="sm" className="h-8 rounded-xl text-xs font-semibold">
                  View All
                </Button>
              </Link>
            </div>
            <div className="space-y-3">
              {workload.slice(0, 5).map((member, index) => {
                const total = member.total;
                const barsFilled = Math.min(5, Math.max(1, Math.ceil(total / 2)));
                return (
                  <div key={index} className="flex items-center justify-between rounded-xl border border-border/70 bg-secondary/30 p-3 transition-colors hover:bg-secondary/60">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-bold text-accent border border-border">
                        {member.user.name.split(" ").map(n => n[0]).join("").toUpperCase()}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-foreground leading-tight">{member.user.name}</p>
                        <p className="text-[11px] text-muted-foreground">{member.open} open · {member.in_progress} active</p>
                      </div>
                    </div>

                    {/* Tabela 5-segment visual workload bar */}
                    <div className="flex items-center gap-4">
                      <div className="hidden sm:flex items-center gap-1.5">
                        <span className="text-[11px] font-medium text-muted-foreground">Load</span>
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((b) => (
                            <span
                              key={b}
                              className={cn(
                                "h-2 w-3 rounded-xs transition-colors",
                                b <= barsFilled
                                  ? "bg-accent"
                                  : "bg-secondary"
                              )}
                            />
                          ))}
                        </div>
                      </div>

                      <span className="font-mono text-xs font-bold text-foreground tabular-nums">
                        {total}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent Tickets — promoted into the grid for managers/admins so the
            two team-level cards lead the dashboard. */}
        {isManagerial && (
          <ChartCard title="Recent Tickets" description="Latest activity across the workspace">
            <div className="h-64 overflow-y-auto">
              {recentTickets.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">No recent tickets. New tickets will appear here as they come in.</p>
              ) : (
                <TicketList
                  tickets={recentTickets}
                  variant="compact"
                  hrefFor={(t) => ticketHref(t)}
                />
              )}
            </div>
          </ChartCard>
        )}

        {/* Tickets by Status — team/org view; agents work a flat list instead
            (their Recent Tickets card takes this slot). */}
        {isManagerial && (
          <ChartCard
            title="Tickets by Status"
            description="Where work is sitting right now"
            badge={
              <Badge
                variant="outline"
                className="border-none bg-blue-500/10 text-blue-500 font-medium px-2 py-0.5 text-xs inline-flex items-center gap-1 ml-1"
              >
                <span>{overview.total} total</span>
              </Badge>
            }
          >
            <div className="h-64">
              {charts.byStatus.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <p className="text-sm text-muted-foreground">No status data yet.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={charts.byStatus}
                    layout="vertical"
                    margin={{ top: 5, right: 15, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" opacity={0.15} stroke="hsl(var(--border))" />
                    <XAxis
                      type="number"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    />
                    <YAxis
                      type="category"
                      dataKey="status"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "hsl(var(--foreground))", fontSize: 12, fontWeight: 500 }}
                      width={95}
                      tickFormatter={(val) => {
                        const labels: Record<string, string> = {
                          open: "Open",
                          in_progress: "In Progress",
                          on_hold: "On Hold",
                          resolved: "Resolved",
                          closed: "Closed",
                        };
                        return labels[val] || val.replace("_", " ");
                      }}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const data = payload[0].payload as { status: string; count: number };
                        const colors: Record<string, { label: string; fill: string }> = {
                          open: { label: "Open", fill: "#3B82F6" },
                          in_progress: { label: "In Progress", fill: "#F59E0B" },
                          on_hold: { label: "On Hold", fill: "#A855F7" },
                          resolved: { label: "Resolved", fill: "#10B981" },
                          closed: { label: "Closed", fill: "#64748B" },
                        };
                        const meta = colors[data.status] || { label: data.status.replace("_", " "), fill: "#3B82F6" };
                        const pct = overview.total > 0 ? Math.round((data.count / overview.total) * 100) : 0;
                        return (
                          <div className="rounded-xl border border-border bg-popover/95 px-3 py-2 text-xs shadow-xl backdrop-blur-xs">
                            <div className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: meta.fill }} />
                              <span className="font-semibold text-foreground">{meta.label}</span>
                              <span className="font-mono font-bold text-foreground tabular-nums ml-auto pl-3">{data.count}</span>
                            </div>
                            <p className="mt-1 text-[11px] text-muted-foreground pl-4.5">
                              {pct}% of workload
                            </p>
                          </div>
                        );
                      }}
                      cursor={{ fill: "hsl(var(--muted))", opacity: 0.15 }}
                    />
                    <Bar
                      dataKey="count"
                      radius={[0, 8, 8, 0]}
                      barSize={16}
                      background={{ fill: "hsl(var(--muted)/0.25)", radius: 8 }}
                    >
                      {charts.byStatus.map((entry, index) => {
                        const colors: Record<string, string> = {
                          open: "#3B82F6",
                          in_progress: "#F59E0B",
                          on_hold: "#A855F7",
                          resolved: "#10B981",
                          closed: "#64748B",
                        };
                        return (
                          <Cell
                            key={index}
                            fill={colors[entry.status] || "#3B82F6"}
                          />
                        );
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </ChartCard>
        )}

        {/* Super-admin-only pair: org-wide department spread + weekly trend
            side by side in one row. */}
        {isSuperAdmin && (
          <>
            <ChartCard
              title="Tickets by Department"
              description="Load spread across teams"
              badge={
                <Badge
                  variant="outline"
                  className="border-none bg-purple-500/10 text-purple-500 font-medium px-2 py-0.5 text-xs inline-flex items-center gap-1 ml-1"
                >
                  <Layers className="h-3.5 w-3.5" />
                  <span>{charts.byDepartment.length} teams</span>
                </Badge>
              }
            >
              <div className="h-64">
                {charts.byDepartment.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <p className="text-sm text-muted-foreground">No department data yet.</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={charts.byDepartment}
                      layout="vertical"
                      margin={{ top: 5, right: 15, left: 0, bottom: 5 }}
                    >
                      <CartesianGrid horizontal={false} strokeDasharray="3 3" opacity={0.15} stroke="hsl(var(--border))" />
                      <XAxis
                        type="number"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                        allowDecimals={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="department"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "hsl(var(--foreground))", fontSize: 12, fontWeight: 500 }}
                        width={110}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const data = payload[0].payload as { department: string; count: number };
                          const palette = ["#3B82F6", "#EC4899", "#10B981", "#F59E0B", "#8B5CF6"];
                          const index = charts.byDepartment.findIndex((d) => d.department === data.department);
                          const color = palette[Math.max(0, index) % palette.length];
                          const total = charts.byDepartment.reduce((s, d) => s + d.count, 0);
                          const pct = total > 0 ? Math.round((data.count / total) * 100) : 0;
                          return (
                            <div className="rounded-xl border border-border bg-popover/95 px-3 py-2 text-xs shadow-xl backdrop-blur-xs">
                              <div className="flex items-center gap-2">
                                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                <span className="font-semibold text-foreground">{data.department}</span>
                                <span className="font-mono font-bold text-foreground tabular-nums ml-auto pl-3">{data.count}</span>
                              </div>
                              <p className="mt-1 text-[11px] text-muted-foreground pl-4.5">
                                {pct}% of team workload
                              </p>
                            </div>
                          );
                        }}
                        cursor={{ fill: "hsl(var(--muted))", opacity: 0.15 }}
                      />
                      <Bar
                        dataKey="count"
                        radius={[0, 8, 8, 0]}
                        barSize={16}
                        background={{ fill: "hsl(var(--muted)/0.25)", radius: 8 }}
                      >
                        {charts.byDepartment.map((_, index) => {
                          const palette = ["#3B82F6", "#EC4899", "#10B981", "#F59E0B", "#8B5CF6"];
                          return (
                            <Cell
                              key={index}
                              fill={palette[index % palette.length]}
                            />
                          );
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </ChartCard>
            <ChartCard title="Weekly Trend" description="New tickets per week, last 12 weeks">
              {weeklyTrendBody}
            </ChartCard>
          </>
        )}

        {/* Recent Tickets — agents: first grid card (the by-status slot).
            Managers already have theirs leading the grid above. */}
        {!isManagerial && (
          <ChartCard title="Recent Tickets" description="Your latest tickets">
            <div className="h-64 overflow-y-auto">
              {recentTickets.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">No recent tickets. New tickets will appear here as they come in.</p>
              ) : (
                <TicketList
                  tickets={recentTickets}
                  variant="compact"
                  hrefFor={(t) => ticketHref(t)}
                />
              )}
            </div>
          </ChartCard>
        )}

        {/* Tickets by Priority */}
        <ChartCard
          title="Tickets by Priority"
          description="Share of tickets at each urgency level"
          badge={
            <Badge
              variant="outline"
              className="border-none bg-emerald-500/10 text-emerald-500 font-medium px-2 py-0.5 text-xs inline-flex items-center gap-1 ml-1"
            >
              <TrendingUp className="h-3.5 w-3.5" />
              <span>{resolutionRate > 0 ? `${resolutionRate}%` : "5.2%"}</span>
            </Badge>
          }
        >
          {priorityChartData.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-center">
              <p className="text-sm text-muted-foreground">No priority data yet.</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Tickets will appear here categorized by urgency</p>
            </div>
          ) : (
            <div>
              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const data = payload[0].payload as { label: string; count: number; fill: string };
                        const pct = totalPriorityTickets > 0 ? Math.round((data.count / totalPriorityTickets) * 100) : 0;
                        return (
                          <div className="rounded-xl border border-border bg-popover/95 px-3 py-2 text-xs shadow-xl backdrop-blur-xs">
                            <div className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: data.fill }} />
                              <span className="font-semibold text-foreground">{data.label}</span>
                              <span className="font-mono font-bold text-foreground tabular-nums ml-auto pl-3">{data.count}</span>
                            </div>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {pct}% of active tickets
                            </p>
                          </div>
                        );
                      }}
                      cursor={false}
                    />
                    <Pie
                      data={priorityChartData}
                      dataKey="count"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={80}
                      cornerRadius={8}
                      paddingAngle={5}
                      stroke="none"
                    >
                      {priorityChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Priority Pills Legend */}
              <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs">
                {priorityChartData.map((item) => {
                  const pct = totalPriorityTickets > 0 ? Math.round((item.count / totalPriorityTickets) * 100) : 0;
                  return (
                    <div key={item.priority} className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: item.fill }} />
                      <span className="text-muted-foreground font-medium">{item.label}</span>
                      <span className="font-mono font-semibold text-foreground tabular-nums">
                        {item.count}
                        <span className="text-[10px] text-muted-foreground font-normal ml-0.5">({pct}%)</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </ChartCard>

      </div>

      {/* Weekly Trend — full-width for manager/agent (super admin already
          has it paired with Tickets by Department above). */}
      {!isSuperAdmin && (
        <ChartCard title="Weekly Trend" description="New tickets per week, last 12 weeks">
          {weeklyTrendBody}
        </ChartCard>
      )}

      {/* Individual Contribution Activity Heatmap */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-2xs">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-bold text-foreground tracking-tight">
              Individual Contribution Activity
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Daily ticket actions, resolutions, and response activity by {session?.user?.name || "you"}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto no-scrollbar">
          <ActivityHeatmap
            days={userActivityDays}
            label={`Contributions by ${session?.user?.name || "Member"}`}
            period="the last year"
            selectedDate={selectedHeatmapDate}
            onSelectDate={setSelectedHeatmapDate}
            unit={{ one: "contribution", other: "contributions" }}
          />
        </div>
      </div>
    </div>
  );
}