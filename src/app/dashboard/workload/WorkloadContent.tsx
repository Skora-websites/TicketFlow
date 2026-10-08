"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
      <div className="space-y-6 animate-pulse" aria-label="Loading workload" aria-busy="true">
        <div>
          <div className="h-8 bg-muted rounded w-1/4 mb-2" />
          <div className="h-4 bg-muted rounded w-1/3" />
        </div>
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
        <Card className="card-elevated">
          <CardContent className="p-6">
            <div className="h-4 bg-muted rounded w-1/4 mb-4" />
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  <div className="w-10 h-10 rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-1/3" />
                    <div className="h-3 bg-muted rounded w-1/4" />
                  </div>
                  <div className="w-20 h-8 bg-muted rounded" />
                  <div className="w-16 h-8 bg-muted rounded" />
                  <div className="w-16 h-8 bg-muted rounded" />
                  <div className="w-16 h-8 bg-muted rounded" />
                  <div className="w-24 h-6 bg-muted rounded" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="card-elevated">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Team Members</p>
                <p className="font-display text-3xl font-semibold tracking-tight text-foreground mt-1">{workload.length}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-primary-muted flex items-center justify-center">
                <Users className="w-6 h-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="card-elevated">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Open Tickets</p>
                <p className="font-display text-3xl font-semibold tracking-tight text-foreground mt-1">
                  {workload.reduce((sum, m) => sum + m.open, 0)}
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-info-muted flex items-center justify-center">
                <Clock className="w-6 h-6 text-info" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="card-elevated">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">In Progress</p>
                <p className="font-display text-3xl font-semibold tracking-tight text-foreground mt-1">
                  {workload.reduce((sum, m) => sum + m.in_progress, 0)}
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-warning-muted flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-warning" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="card-elevated">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">On Hold</p>
                <p className="font-display text-3xl font-semibold tracking-tight text-foreground mt-1">
                  {workload.reduce((sum, m) => sum + m.on_hold, 0)}
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-accent-muted flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-accent" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Workload Table */}
      <Card className="card-elevated">
        <CardHeader>
          <CardTitle className="text-lg">Workload Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 font-medium text-muted-foreground">Team Member</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">Open</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">In Progress</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">On Hold</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">Total</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Department</th>
                </tr>
              </thead>
              <tbody>
                {workload.map((member, index) => (
                  <tr key={index} className="border-b border-border/50 hover:bg-muted/50">
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <UserAvatar name={member.user.name} role={member.user.role as any} size="md" />
                        <div>
                          <p className="font-medium">{member.user.name}</p>
                          <p className="text-sm text-muted-foreground">{member.user.email}</p>
                        </div>
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
                    <td className="text-center p-3 font-semibold text-lg">
                      {member.total}
                    </td>
                    <td className="p-3">
                      {member.user.departmentId && (
                        <DepartmentBadge name={member.user.departmentId.name} color={member.user.departmentId.color} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}