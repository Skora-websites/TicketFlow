"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TicketList, ticketHref } from "@/components/tickets";
import { IncomingTransfersCard } from "./IncomingTransfersCard";
import { formatAvgResolution } from "@/lib/formatAvgResolution";
import { TRANSFERS_ENABLED } from "@/lib/features";
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
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

type TrendTone = "good" | "bad" | "neutral";

interface StatCardProps {
  title: string;
  value: string | number;
  trend?: string;
  trendTone?: TrendTone;
}

const trendToneClasses: Record<TrendTone, string> = {
  good: "text-success",
  bad: "text-warning",
  neutral: "text-muted-foreground",
};

function StatCard({ title, value, trend, trendTone = "neutral" }: StatCardProps) {
  const TrendIcon = trendTone === "good" ? TrendingUp : trendTone === "bad" ? TrendingDown : Minus;
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{title}</p>
        </div>
        <p className="font-display mt-2 text-4xl font-bold tracking-tight text-foreground tabular-nums">{value}</p>
        {trend ? (
          <p className={cn("mt-2 flex items-center gap-1.5 text-[13px]", trendToneClasses[trendTone])}>
            <TrendIcon className="h-3.5 w-3.5" aria-hidden />
            {trend}
          </p>
        ) : (
          <p className="mt-2 text-[13px] text-muted-foreground/60" aria-hidden>—</p>
        )}
      </CardContent>
      <div className={cn(
        "h-1",
        trendTone === "good" ? "bg-success" : trendTone === "bad" ? "bg-warning" : "bg-border"
      )} aria-hidden />
    </Card>
  );
}

interface ChartCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

function ChartCard({ title, description, children, className }: ChartCardProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
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
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [recentTickets, setRecentTickets] = useState<any[]>([]);

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
  // data lands: same header, same stat-card count, same grid/full-width
  // split (managerial grids lead with Workload + Recent; super admin's grid
  // also carries the Dept+Trend pair; agents' Recent Tickets is in-grid).
  if (isLoading) {
    // Card counts mirror each role's real layout so nothing shifts on load.
    const gridCards = isSuperAdmin ? 6 : isManagerial ? 4 : 2;
    const fullWidthCards = isSuperAdmin ? 0 : isManagerial ? 1 : 0;
    const pulse = "animate-pulse rounded bg-muted";
    return (
      <div className="space-y-6" aria-label="Loading dashboard" aria-busy="true">
        {/* Header */}
        <div>
          <div className={`h-9 w-48 ${pulse}`} />
          <div className={`mt-2 h-4 w-64 ${pulse}`} />
        </div>
        {/* Stats — five cards for every role (Unassigned for managerial, On Hold for agents) */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 space-y-2">
                    <div className={`h-4 w-2/3 ${pulse}`} />
                    <div className={`h-8 w-1/2 ${pulse}`} />
                    <div className={`h-3 w-1/3 ${pulse}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        {/* Chart grid */}
        <div className="grid gap-6 lg:grid-cols-2">
          {Array.from({ length: gridCards }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <div className={`h-5 w-40 ${pulse}`} />
              </CardHeader>
              <CardContent>
                <div className={`h-64 rounded-lg ${pulse}`} />
              </CardContent>
            </Card>
          ))}
        </div>
        {/* Full-width cards */}
        {Array.from({ length: fullWidthCards }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <div className={`h-5 w-40 ${pulse}`} />
            </CardHeader>
            <CardContent>
              <div className={`h-64 rounded-lg ${pulse}`} />
            </CardContent>
          </Card>
        ))}
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-header-title">Overview</h1>
          <p className="page-header-sub" role="status">
            {overview.open} open · avg resolution{" "}
            {formatAvgResolution(overview.avgResolutionDays, overview.avgResolutionHours)}
          </p>
        </div>
        <Link href="/dashboard/tickets">
          <Button variant="outline">View all tickets</Button>
        </Link>
      </div>

      {/* Stats Grid — agent-scoped: the stats API already filters every
          counter to tickets the signed-in user is assigned to or filed.
          Managerial roles get the Unassigned card beside In Progress (their
          unassigned queue); agents get the On Hold card instead. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          title="Open Tickets"
          value={overview.open}
          trend={`${overview.on_hold} on hold`}
          trendTone="neutral"
        />
        <StatCard
          title="In Progress"
          value={overview.in_progress}
          trend={`${Math.round((overview.in_progress / Math.max(overview.total, 1)) * 100)}% of all tickets`}
          trendTone="neutral"
        />
        {isManagerial && (
          <StatCard
            title="Unassigned"
            value={overview.unassigned}
            trend={overview.unassigned > 5 ? "Needs attention" : "Under control"}
            trendTone={overview.unassigned > 5 ? "bad" : "good"}
          />
        )}
        {!isManagerial && (
          <StatCard
            title="On Hold"
            value={overview.on_hold}
            trend="waiting on something"
            trendTone="neutral"
          />
        )}
        <StatCard
          title="Total"
          value={overview.total}
          trend={`${overview.open + overview.in_progress + overview.on_hold} active`}
          trendTone="neutral"
        />
        <StatCard
          title="Resolution Rate"
          value={`${overview.total > 0 ? Math.round(((overview.resolved + overview.closed) / overview.total) * 100) : 0}%`}
          trend={`${overview.resolved + overview.closed} resolved`}
          trendTone="good"
        />
      </div>

      {/* Charts grid — two cards per row. Managers/super admins lead with
          the team-level cards; the agent overview stays personal-scope only. */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Team Workload — table only, scrollable within the chart-card height */}
        {isManagerial && workload.length > 0 && (
          <ChartCard title="Team Workload" description="Open load per team member">
            <div className="h-64 overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border">
                    <th className="text-left p-3 font-medium text-muted-foreground">Team Member</th>
                    <th className="text-center p-3 font-medium text-muted-foreground">Open</th>
                    <th className="text-center p-3 font-medium text-muted-foreground">In Progress</th>
                    <th className="text-center p-3 font-medium text-muted-foreground">On Hold</th>
                    <th className="text-center p-3 font-medium text-muted-foreground">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {workload.map((member, index) => (
                    <tr key={index} className="border-b border-border/50 hover:bg-muted/50">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-medium">
                            {member.user.name.split(" ").map(n => n[0]).join("").toUpperCase()}
                          </div>
                          <span className="font-medium">{member.user.name}</span>
                        </div>
                      </td>
                      <td className="text-center p-3">
                        <Badge variant="outline" className="status-open">{member.open}</Badge>
                      </td>
                      <td className="text-center p-3">
                        <Badge variant="outline" className="status-in_progress">{member.in_progress}</Badge>
                      </td>
                      <td className="text-center p-3">
                        <Badge variant="outline" className="status-on_hold">{member.on_hold}</Badge>
                      </td>
                      <td className="text-center p-3 font-semibold">{member.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>
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
          <ChartCard title="Tickets by Status" description="Where work is sitting right now">
            <div className="h-64">
              {charts.byStatus.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <p className="text-sm text-muted-foreground">No status data yet.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts.byStatus} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
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
              )}
            </div>
          </ChartCard>
        )}

        {/* Super-admin-only pair: org-wide department spread + weekly trend
            side by side in one row. */}
        {isSuperAdmin && (
          <>
            <ChartCard title="Tickets by Department" description="Load spread across teams">
              <div className="h-64">
                {charts.byDepartment.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <p className="text-sm text-muted-foreground">No department data yet.</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={charts.byDepartment} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} allowDecimals={false} />
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
        <ChartCard title="Tickets by Priority" description="Share of tickets at each urgency level">
          <div className="h-64">
            {charts.byPriority.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-muted-foreground">No priority data yet.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={charts.byPriority}
                    cx="50%"
                    cy="46%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="count"
                    nameKey="priority"
                    strokeWidth={0}
                  >
                    {charts.byPriority.map((entry, index) => (
                      <Cell
                        key={index}
                        fill={priorityColors[entry.priority as keyof typeof priorityColors] || "hsl(var(--primary))"}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 12 }}
                    formatter={(value) => <span className="capitalize text-muted-foreground">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>

      </div>

      {/* Weekly Trend — full-width for manager/agent (super admin already
          has it paired with Tickets by Department above). */}
      {!isSuperAdmin && (
        <ChartCard title="Weekly Trend" description="New tickets per week, last 12 weeks">
          {weeklyTrendBody}
        </ChartCard>
      )}

      {/* (Agents' Recent Tickets now lives inside the grid, in the old
          Tickets-by-Status slot; managers have it leading their grid.) */}
    </div>
  );
}