"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { UserAvatar, DepartmentBadge } from "@/components/tickets";
import { Users, Clock, AlertTriangle, TrendingUp } from "lucide-react";
import { IUser } from "@/lib/db/models";

interface WorkloadMember {
  user: IUser & { departmentId?: any };
  open: number;
  in_progress: number;
  on_hold: number;
  total: number;
}

export function WorkloadContent() {
  const [workload, setWorkload] = useState<WorkloadMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchWorkload() {
      try {
        const res = await fetch("/api/stats");
        if (!res.ok) throw new Error("Failed to fetch workload");
        const data = await res.json();
        setWorkload(data.workload || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load workload");
      } finally {
        setIsLoading(false);
      }
    }
    fetchWorkload();
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-6" aria-label="Loading workload" aria-busy="true">
        {/* Header */}
        <div>
          <Skeleton className="h-8 w-44 rounded-md mb-1.5" />
          <Skeleton className="h-4 w-72 rounded-md" />
        </div>

        {/* Shared Horizontal Metrics Strip */}
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
          <div className="grid grid-cols-2 divide-y divide-border sm:grid-cols-4 sm:divide-x sm:divide-y-0">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-4 sm:p-5">
                <Skeleton className="h-3.5 w-24 rounded" />
                <div className="mt-2 flex items-baseline gap-2">
                  <Skeleton className="h-7 w-12 rounded" />
                  <Skeleton className="h-3 w-14 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Workload Section */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Skeleton className="h-6 w-48 rounded-md" />
              <Skeleton className="mt-1 h-3.5 w-72 rounded-md" />
            </div>
            <Skeleton className="h-4 w-16 rounded-md font-mono" />
          </div>

          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-secondary/20 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                {/* Agent Identity */}
                <div className="flex items-center gap-3.5 min-w-[200px]">
                  <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                  <div className="min-w-0 space-y-1.5 flex-1">
                    <Skeleton className="h-4 w-28 rounded" />
                    <Skeleton className="h-3 w-20 rounded" />
                  </div>
                </div>

                {/* Status Count Pills */}
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <Skeleton className="h-6 w-16 rounded-full" />
                  <Skeleton className="h-6 w-18 rounded-full" />
                  <Skeleton className="h-6 w-16 rounded-full" />
                </div>

                {/* 5-Segment Workload Meter */}
                <div className="flex items-center justify-between sm:justify-start gap-3 pt-1 sm:pt-0 border-t border-border/50 sm:border-t-0">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-3 w-24 rounded" />
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((b) => (
                        <Skeleton key={b} className="h-2.5 w-3.5 rounded-xs" />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">Failed to load workload</h2>
        <p className="text-muted-foreground mb-4">{error}</p>
        <button onClick={() => window.location.reload()} className="text-primary hover:underline">
          Retry
        </button>
      </div>
    );
  }

  if (workload.length === 0) {
    return (
      <div className="text-center py-12">
        <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">No workload data</h2>
        <p className="text-muted-foreground mb-4">Team workload will appear here when team members have assigned tickets.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="page-header-title">Team Workload</h1>
        <p className="page-header-sub">
          Monitor ticket distribution across team members
        </p>
      </div>

      {/* Summary Cards */}
      {/* Shared Horizontal Metrics Strip */}
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
        <div className="grid grid-cols-2 divide-y divide-border sm:grid-cols-4 sm:divide-x sm:divide-y-0">
          <div className="p-4 sm:p-5">
            <span className="text-xs font-medium text-muted-foreground">Team Members</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {workload.length}
              </span>
              <span className="text-xs text-muted-foreground">active</span>
            </div>
          </div>

          <div className="p-4 sm:p-5">
            <span className="text-xs font-medium text-muted-foreground">Open Tickets</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {workload.reduce((sum, m) => sum + m.open, 0)}
              </span>
              <span className="text-xs text-muted-foreground">assigned</span>
            </div>
          </div>

          <div className="p-4 sm:p-5">
            <span className="text-xs font-medium text-muted-foreground">In Progress</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {workload.reduce((sum, m) => sum + m.in_progress, 0)}
              </span>
              <span className="text-xs text-muted-foreground">in active work</span>
            </div>
          </div>

          <div className="p-4 sm:p-5">
            <span className="text-xs font-medium text-muted-foreground">On Hold</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {workload.reduce((sum, m) => sum + m.on_hold, 0)}
              </span>
              <span className="text-xs text-muted-foreground">pending review</span>
            </div>
          </div>
        </div>
      </div>

      {/* Workload Section with Tabela 5-Segment Bar Meters */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground tracking-tight">Active Team Workload</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Capacity and active ticket distribution across team members</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-mono">{workload.length} agents</span>
          </div>
        </div>

        <div className="space-y-3">
          {workload.map((member, index) => {
            const barsFilled = Math.min(5, Math.max(0, Math.ceil(member.total / 2)));
            return (
              <div
                key={index}
                className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-secondary/20 p-4 transition-all hover:bg-secondary/40 hover:border-foreground/20 sm:flex-row sm:items-center sm:justify-between"
              >
                {/* Agent Identity */}
                <div className="flex items-center gap-3.5 min-w-[200px]">
                  <UserAvatar name={member.user.name} role={member.user.role as any} size="md" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-foreground leading-tight">{member.user.name}</p>
                    <p className="truncate text-xs text-muted-foreground mt-0.5">
                      {member.user.departmentId?.name || "General Support"}
                    </p>
                  </div>
                </div>

                {/* Status Count Pills */}
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EDE8FD] px-2.5 py-0.5 text-xs font-semibold text-[#6D28D9] dark:bg-[#6D28D9]/20 dark:text-[#C4B5FD]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#6D28D9]" />
                    {member.open} Open
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E3F5F1] px-2.5 py-0.5 text-xs font-semibold text-[#1D7465] dark:bg-[#1D7465]/25 dark:text-[#6EE7B7]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#1D7465]" />
                    {member.in_progress} Active
                  </span>
                  {member.on_hold > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FEF3C7] px-2.5 py-0.5 text-xs font-semibold text-[#B45309] dark:bg-[#B45309]/20 dark:text-[#FCD34D]">
                      {member.on_hold} Hold
                    </span>
                  )}
                </div>

                {/* Tabela 5-Segment Workload Meter */}
                <div className="flex items-center justify-between sm:justify-start gap-3 pt-1 sm:pt-0 border-t border-border/50 sm:border-t-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Staff Workload
                    </span>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((b) => (
                        <span
                          key={b}
                          className={cn(
                            "h-2.5 w-3.5 rounded-xs transition-colors",
                            b <= barsFilled
                              ? "bg-accent"
                              : "bg-secondary"
                          )}
                        />
                      ))}
                    </div>
                  </div>

                  <span className="font-mono text-sm font-bold text-foreground tabular-nums min-w-[24px] text-right">
                    {member.total}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}