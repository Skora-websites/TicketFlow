"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { AlertTriangle, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { statusColors, priorityColors } from "@/lib/charts";
import { ChartTooltip } from "@/components/charts/ChartTooltip";

interface ChartCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

function ChartCard({ title, description, children, className }: ChartCardProps) {
  return (
    <Card className={cn("card-elevated", className)}>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">{title}</CardTitle>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
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
      weeklyResolved: [] as { week: string; count: number }[],
    },
    workload: [] as any[],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch("/api/stats");
        if (!res.ok) throw new Error("Failed to fetch stats");
        const data = await res.json();
        setStats(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load analytics");
      } finally {
        setIsLoading(false);
      }
    }
    fetchStats();
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse" aria-label="Loading analytics" aria-busy="true">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="card-elevated">
              <CardContent className="p-6">
                <div className="h-4 bg-muted rounded w-1/4 mb-2" />
                <div className="h-8 bg-muted rounded w-1/3" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="card-elevated"><CardContent className="h-64" /></Card>
          <Card className="card-elevated"><CardContent className="h-64" /></Card>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="card-elevated"><CardContent className="h-64" /></Card>
          <Card className="card-elevated"><CardContent className="h-64" /></Card>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="card-elevated"><CardContent className="h-64" /></Card>
          <Card className="card-elevated"><CardContent className="h-64" /></Card>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">Failed to load analytics</h2>
        <p className="text-muted-foreground mb-4">{error}</p>
        <button onClick={() => window.location.reload()} className="text-primary hover:underline">Retry</button>
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

      {/* Summary Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Tickets"
          value={overview.total}
          icon={<TrendingUp className="w-6 h-6 text-primary" />}
          bgColor="bg-primary-muted"
          trend={overview.total > 0 ? { value: "Overall", type: "neutral" } : undefined}
        />
        <StatCard
          title="Open Tickets"
          value={overview.open}
          icon={<TrendingUp className="w-6 h-6 text-info" />}
          bgColor="bg-info-muted"
        />
        <StatCard
          title="Avg. Resolution"
          value={formatAvgResolution(overview.avgResolutionDays, overview.avgResolutionHours)}
          icon={<TrendingUp className="w-6 h-6 text-warning" />}
          bgColor="bg-warning-muted"
        />
        <StatCard
          title="Resolution Rate"
          value={overview.total > 0 ? `${Math.round(((overview.resolved + overview.closed) / overview.total) * 100)}%` : "0%"}
          icon={<TrendingUp className="w-6 h-6 text-success" />}
          bgColor="bg-success-muted"
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Tickets by Status - Bar Chart */}
        <ChartCard title="Tickets by Status" description="Distribution of tickets across all statuses">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={charts.byStatus.length > 0 ? charts.byStatus : [{ status: "No data", count: 0 }]}
                layout="vertical"
              >
                <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <YAxis
                  type="category"
                  dataKey="status"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                  width={100}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} />
                <Bar
                  dataKey="count"
                  radius={[0, 4, 4, 0]}
                >
                  {charts.byStatus.map((entry, index) => (
                    <Cell key={index} fill={statusColors[entry.status as keyof typeof statusColors] || "hsl(var(--primary))"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* Tickets by Priority - Pie Chart */}
        <ChartCard title="Tickets by Priority" description="Priority distribution of all tickets">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={charts.byPriority.length > 0 ? charts.byPriority : [{ priority: "No data", count: 1 }]}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="count"
                  nameKey="priority"
                  label={({ name, percent }) => `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {charts.byPriority.map((entry, index) => (
                    <Cell
                      key={index}
                      fill={priorityColors[entry.priority as keyof typeof priorityColors] || "hsl(var(--primary))"}
                    />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {/* Charts Row 2 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Tickets by Department */}
        <ChartCard title="Tickets by Department" description="Ticket volume per department">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={charts.byDepartment.length > 0 ? charts.byDepartment : [{ department: "No data", count: 0 }]}
                layout="vertical"
              >
                <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <YAxis
                  type="category"
                  dataKey="department"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                  width={120}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} fill="hsl(var(--primary))" />
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