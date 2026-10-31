"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithCache, getCached } from "@/lib/client-cache";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatAvgResolution } from "@/lib/formatAvgResolution";
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
  AreaChart,
  Area,
} from "recharts";
import { AlertTriangle, TrendingUp, TrendingDown, Minus, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
    <div className={cn("rounded-2xl border border-border bg-card p-5 shadow-sm", className)}>
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-bold text-foreground tracking-tight">{title}</h2>
          {badge}
        </div>
        {description && <p className="text-[12px] text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div>{children}</div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  bgColor: string;
  trend?: { value: string; type: "up" | "down" | "neutral" };
}

function StatCard({ title, value, icon, bgColor, trend }: StatCardProps) {
  return (
    <Card className="card-elevated">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="font-display text-3xl font-semibold tracking-tight text-foreground mt-1">{value}</p>
            {trend && (
              <p className="text-sm mt-1 flex items-center gap-1">
                {trend.type === "up" && <TrendingUp className="w-3 h-3 text-success" />}
                {trend.type === "down" && <TrendingDown className="w-3 h-3 text-destructive" />}
                {trend.type === "neutral" && <Minus className="w-3 h-3 text-muted-foreground" />}
                <span className={cn(
                  trend.type === "up" && "text-success",
                  trend.type === "down" && "text-destructive",
                  trend.type === "neutral" && "text-muted-foreground"
                )}>
                  {trend.value}
                </span>
              </p>
            )}
          </div>
          <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", bgColor)}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function AnalyticsContent() {
  const cachedStats = getCached<{
    overview: {
      total: number;
      open: number;
      in_progress: number;
      on_hold: number;
      resolved: number;
      closed: number;
      unassigned: number;
      avgResolutionDays: number;
      avgResolutionHours: number;
    };
    charts: {
      byStatus: { status: string; count: number }[];
      byPriority: { priority: string; count: number }[];
      byDepartment: { department: string; count: number }[];
      weeklyTrend: { week: string; count: number }[];
      weeklyResolved: { week: string; count: number }[];
    };
    workload: any[];
  }>("/api/stats");

  const [stats, setStats] = useState(
    cachedStats || {
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
        weeklyResolved: [] as { week: string; count: number }[],
      },
      workload: [] as any[],
    }
  );
  const [isLoading, setIsLoading] = useState(!cachedStats);
  const [error, setError] = useState("");

  const fetchStats = useCallback(async (force = false) => {
    if (!stats.overview.total) setIsLoading(true);
    setError("");
    try {
      const data = await fetchWithCache<typeof stats>("/api/stats", undefined, { ttlMs: 30_000, force });
      setStats(data);
    } catch (err) {
      if (!stats.overview.total) {
        setError(err instanceof Error ? err.message : "Failed to load analytics");
      }
    } finally {
      setIsLoading(false);
    }
  }, [stats.overview.total]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (isLoading) {
    return (
      <div className="space-y-6" aria-label="Loading analytics" aria-busy="true">
        {/* Page Header */}
        <div>
          <Skeleton className="h-8 w-36 rounded-md mb-1.5" />
          <Skeleton className="h-4 w-80 rounded-md" />
        </div>

        {/* Shared Horizontal Metrics Strip */}
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
          <div className="grid grid-cols-2 divide-y divide-border sm:grid-cols-4 sm:divide-x sm:divide-y-0">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-4 sm:p-5">
                <Skeleton className="h-3.5 w-24 rounded" />
                <div className="mt-2 flex items-baseline gap-2">
                  <Skeleton className="h-7 w-16 rounded" />
                  <Skeleton className="h-3 w-16 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Charts Rows */}
        <div className="grid gap-6 lg:grid-cols-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="card-elevated">
              <CardHeader>
                <Skeleton className="h-5 w-40 rounded" />
                <Skeleton className="h-3.5 w-60 rounded mt-1.5" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-64 w-full rounded-xl" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error && !stats.overview.total) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">Failed to load analytics</h2>
        <p className="text-muted-foreground mb-4">{error}</p>
        <Button onClick={() => fetchStats(true)}>Retry</Button>
      </div>
    );
  }

  const { overview, charts } = stats;

  const createdVsResolved = charts.weeklyTrend.map((w, i) => ({
    week: w.week,
    created: w.count,
    resolved: charts.weeklyResolved[i]?.count ?? 0,
  }));
  // Cumulative resolution rate: share of all tickets created to date that have
  // been resolved. (A per-week resolved/created ratio is a cross-window metric
  // that can exceed 100% whenever a backlog is cleared, so it misleads.)
  let cumCreated = 0;
  let cumResolved = 0;
  const resolutionRate = charts.weeklyTrend.map((w, i) => {
    cumCreated += w.count;
    cumResolved += charts.weeklyResolved[i]?.count ?? 0;
    return {
      week: w.week,
      rate: cumCreated > 0 ? Math.round((cumResolved / cumCreated) * 100) : 0,
    };
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="page-header-title">Analytics</h1>
        <p className="page-header-sub">
          Detailed insights into ticket trends and team performance
        </p>
      </div>

      {/* Shared Horizontal Metrics Strip */}
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
        <div className="grid grid-cols-2 divide-y divide-border sm:grid-cols-4 sm:divide-x sm:divide-y-0">
          <div className="p-4 sm:p-5">
            <span className="text-xs font-medium text-muted-foreground">Total Tickets</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {overview.total}
              </span>
              <span className="text-xs text-muted-foreground">all-time</span>
            </div>
          </div>

          <div className="p-4 sm:p-5">
            <span className="text-xs font-medium text-muted-foreground">Open Tickets</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {overview.open}
              </span>
              <span className="text-xs text-muted-foreground">awaiting resolution</span>
            </div>
          </div>

          <div className="p-4 sm:p-5">
            <span className="text-xs font-medium text-muted-foreground">Avg. Resolution</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {formatAvgResolution(overview.avgResolutionDays, overview.avgResolutionHours)}
              </span>
            </div>
          </div>

          <div className="p-4 sm:p-5">
            <span className="text-xs font-medium text-muted-foreground">Resolution Rate</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {overview.total > 0 ? `${Math.round(((overview.resolved + overview.closed) / overview.total) * 100)}%` : "0%"}
              </span>
              <span className="text-xs text-success">completed</span>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row 1 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Tickets by Status - Bar Chart */}
        <ChartCard
          title="Tickets by Status"
          description="Distribution of tickets across all statuses"
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
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={charts.byStatus.length > 0 ? charts.byStatus : [{ status: "No data", count: 0 }]}
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
          </div>
        </ChartCard>

        {/* Tickets by Priority - Rounded Donut Chart */}
        <ChartCard
          title="Tickets by Priority"
          description="Priority distribution of all tickets"
          badge={
            <Badge
              variant="outline"
              className="border-none bg-emerald-500/10 text-emerald-500 font-medium px-2 py-0.5 text-xs inline-flex items-center gap-1 ml-1"
            >
              <TrendingUp className="h-3.5 w-3.5" />
              <span>{overview.total > 0 ? `${Math.round(((overview.resolved + overview.closed) / overview.total) * 100)}%` : "100%"}</span>
            </Badge>
          }
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const data = payload[0].payload as { priority: string; count: number; fill: string };
                    const total = charts.byPriority.reduce((s, p) => s + p.count, 0);
                    const pct = total > 0 ? Math.round((data.count / total) * 100) : 0;
                    return (
                      <div className="rounded-xl border border-border bg-popover/95 px-3 py-2 text-xs shadow-xl backdrop-blur-xs">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: data.fill }} />
                          <span className="font-semibold text-foreground capitalize">{data.priority}</span>
                          <span className="font-mono font-bold text-foreground tabular-nums ml-auto pl-3">{data.count}</span>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground pl-4.5">
                          {pct}% of tickets
                        </p>
                      </div>
                    );
                  }}
                  cursor={false}
                />
                <Pie
                  data={charts.byPriority.map((entry) => {
                    const theme: Record<string, string> = {
                      urgent: "#F43F5E",
                      high: "#F59E0B",
                      medium: "#3B82F6",
                      low: "#10B981",
                      other: "#A855F7",
                    };
                    return {
                      ...entry,
                      fill: theme[entry.priority.toLowerCase()] || "#A855F7",
                    };
                  })}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={80}
                  cornerRadius={8}
                  paddingAngle={5}
                  dataKey="count"
                  nameKey="priority"
                  stroke="none"
                >
                  {charts.byPriority.map((entry, index) => {
                    const theme: Record<string, string> = {
                      urgent: "#F43F5E",
                      high: "#F59E0B",
                      medium: "#3B82F6",
                      low: "#10B981",
                      other: "#A855F7",
                    };
                    return (
                      <Cell
                        key={index}
                        fill={theme[entry.priority.toLowerCase()] || "#A855F7"}
                      />
                    );
                  })}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {/* Charts Row 2 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Tickets by Department */}
        <ChartCard
          title="Tickets by Department"
          description="Ticket volume per department"
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
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={charts.byDepartment.length > 0 ? charts.byDepartment : [{ department: "No data", count: 0 }]}
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
          </div>
        </ChartCard>

        {/* Weekly Trend */}
        <ChartCard title="Weekly Trend (12 Weeks)" description="Ticket creation trend over the last 12 weeks">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={charts.weeklyTrend.length > 0 ? charts.weeklyTrend : [{ week: "No data", count: 0 }]}>
                <defs>
                  <linearGradient id="colorTrend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="week"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  tickFormatter={(value) => new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorTrend)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {/* Charts Row 3 - Additional analytics */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Weekly Created vs Resolved */}
        <ChartCard title="Weekly Created vs Resolved" description="Tickets created vs resolved per week">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={createdVsResolved.length > 0 ? createdVsResolved : [{ week: "No data", created: 0, resolved: 0 }]}>
                <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="week"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  tickFormatter={(value) => new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} />
                <Bar dataKey="created" name="Created" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="resolved" name="Resolved" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* Resolution Rate Trend */}
        <ChartCard title="Resolution Rate Trend" description="Share of all tickets created to date that have been resolved">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={resolutionRate.length > 0 ? resolutionRate : [{ week: "No data", rate: 0 }]}>
                <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="week"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  tickFormatter={(value) => new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} domain={[0, 100]} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} />
                <Line
                  type="monotone"
                  dataKey="rate"
                  stroke="hsl(var(--success))"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>
    </div>
  );
}