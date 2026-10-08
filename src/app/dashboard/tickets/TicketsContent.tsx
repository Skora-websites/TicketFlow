"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TicketList, ticketHref } from "@/components/tickets";
import { TicketTable } from "@/components/tickets/TicketTable";
import { useSession } from "next-auth/react";
import { TRANSFERS_ENABLED } from "@/lib/features";
import { useCategories } from "@/hooks/use-categories";
import {
  Plus,
  Search,
  X,
  Loader2,
  TicketCheck,
  Filter,
  Flag,
  Sparkles,
  Send,
} from "lucide-react";
import type { IUser, IDepartment } from "@/lib/db/models";

interface TicketWithRelations {
  _id: string;
  ticketNumber: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  requesterId?: IUser;
  assigneeId?: IUser;
  departmentId?: IDepartment;
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
  transfer?: {
    status?: string;
    direction?: string;
    fromId?: { _id?: string; name?: string };
    toUserId?: { _id?: string; name?: string } | null;
    toManagerId?: { _id?: string; name?: string } | null;
    toDepartmentId?: { _id?: string; name?: string; color?: string } | null;
  } | null;
}

const ALL = "all";

export function TicketsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { categories } = useCategories();
  const currentUserId = session?.user?.id as string | undefined;
  const currentUserRole = session?.user?.role as string | undefined;
  const [tickets, setTickets] = useState<TicketWithRelations[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [filters, setFilters] = useState({
    status: ALL,
    priority: ALL,
    category: ALL,
    search: "",
  });
  // Bumped after table mutations so the list re-fetches.
  const [refreshKey, setRefreshKey] = useState(0);
  // Local input mirrors instantly; the actual query is debounced.
  const [searchInput, setSearchInput] = useState("");

  const isManagerOrAdmin = currentUserRole === "manager" || currentUserRole === "super_admin";
  const isStaff = currentUserRole === "team" || isManagerOrAdmin;

  const view = searchParams.get("view") || "all";
  const page = pagination.page;
  const limit = pagination.limit;
  const { status, priority, category, search } = filters;

  // Debounce the search box so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((prev) => (prev.search === searchInput ? prev : { ...prev, search: searchInput }));
      setPagination((prev) => ({ ...prev, page: 1 }));
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    async function fetchTickets() {
      setIsLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        params.set("page", page.toString());
        params.set("limit", limit.toString());
        params.set("view", view);
        if (status !== ALL) params.set("status", status);
        if (priority !== ALL) params.set("priority", priority);
        if (category !== ALL) params.set("category", category);
        if (search) params.set("search", search);

        const res = await fetch(`/api/tickets?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch tickets");
        const data = await res.json();
        if (cancelled) return;
        setTickets(data.tickets);
        setPagination(data.pagination);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load tickets");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    fetchTickets();
    return () => {
      cancelled = true;
    };
  }, [page, limit, view, status, priority, category, search, refreshKey]);

  const handleFilterChange = (key: "status" | "priority" | "category", value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleViewChange = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete("view");
    else params.set("view", next);
    const qs = params.toString();
    router.push(qs ? `/dashboard/tickets?${qs}` : "/dashboard/tickets");
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const clearFilters = () => {
    setFilters({ status: ALL, priority: ALL, category: ALL, search: "" });
    setSearchInput("");
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const hasActiveFilters =
    status !== ALL || priority !== ALL || category !== ALL || search !== "";

  const handlePageChange = (newPage: number) => {
    setPagination((prev) => ({ ...prev, page: newPage }));
  };

  const title =
    view === "mine"
      ? "My Tickets"
      : view === "sent"
        ? "Sent Tickets"
        : view === "unassigned"
          ? "Unassigned Tickets"
          : "All Tickets";
  const subtitle =
    view === "mine"
      ? "Tickets assigned to you"
      : view === "sent"
        ? "Tickets you sent to other departments"
        : view === "unassigned"
          ? "Tickets waiting for an assignee"
          : "View and manage all tickets";

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-header-title">{title}</h1>
          <p className="page-header-sub">{subtitle}</p>
        </div>
        <Link href="/dashboard/tickets/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" aria-hidden />
            New Ticket
          </Button>
        </Link>
      </div>

      {/* View tabs — agents see My + Sent only; managers/admins also see All + Unassigned */}
      <Tabs value={view} onValueChange={handleViewChange} aria-label="Ticket views">
        <TabsList>
          <TabsTrigger value="mine">My Tickets</TabsTrigger>
          {/* "Sent" lists inter-department transfers this user dispatched —
              dormant while transfers are disabled. */}
          {isStaff && TRANSFERS_ENABLED && <TabsTrigger value="sent">Sent</TabsTrigger>}
          {isManagerOrAdmin && <TabsTrigger value="all">All Tickets</TabsTrigger>}
          {isManagerOrAdmin && <TabsTrigger value="unassigned">Unassigned</TabsTrigger>}
        </TabsList>
      </Tabs>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 sm:p-6">
          <form
            onSubmit={(e) => e.preventDefault()}
            className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-6"
            role="search"
            aria-label="Filter tickets"
          >
            <div className="relative sm:col-span-2 lg:col-span-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                placeholder="Search tickets..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-10"
                aria-label="Search tickets"
              />
            </div>

            <div>
              <Select value={status} onValueChange={(v) => handleFilterChange("status", v)}>
                <SelectTrigger className="w-full" aria-label="Filter by status">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All Statuses</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Select value={priority} onValueChange={(v) => handleFilterChange("priority", v)}>
                <SelectTrigger className="w-full" aria-label="Filter by priority">
                  <SelectValue placeholder="All Priorities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All Priorities</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Category filter: managers/admins only — agents see their
                assigned + department tickets, not an org-wide category browse. */}
            {isManagerOrAdmin && (
              <div>
                <Select value={category} onValueChange={(v) => handleFilterChange("category", v)}>
                  <SelectTrigger className="w-full" aria-label="Filter by category">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All Categories</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.slug} value={c.slug}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </form>

          {hasActiveFilters && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">Active filters:</span>
              {status !== ALL && (
                <Badge variant="outline" className="gap-1.5 bg-info/5 text-info border-info/20">
                  <Filter className="h-3 w-3" aria-hidden />
                  Status: {status.replace("_", " ")}
                  <button
                    type="button"
                    onClick={() => handleFilterChange("status", ALL)}
                    className="rounded hover:bg-info/10"
                    aria-label="Clear status filter"
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                </Badge>
              )}
              {priority !== ALL && (
                <Badge
                  variant="outline"
                  className="gap-1.5"
                  style={{
                    backgroundColor: `hsl(var(--${priority === "urgent" || priority === "high" ? "destructive" : priority === "medium" ? "warning" : "info"})) / 0.05`,
                    color: `hsl(var(--${priority === "urgent" || priority === "high" ? "destructive" : priority === "medium" ? "warning" : "info"}))`,
                    borderColor: `hsl(var(--${priority === "urgent" || priority === "high" ? "destructive" : priority === "medium" ? "warning" : "info"})) / 0.2`,
                  }}
                >
                  <Flag className="h-3 w-3" aria-hidden />
                  Priority: {priority}
                  <button
                    type="button"
                    onClick={() => handleFilterChange("priority", ALL)}
                    className="rounded hover:bg-destructive/5"
                    aria-label="Clear priority filter"
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                </Badge>
              )}
              {category !== ALL && (
                <Badge variant="outline" className="gap-1.5 bg-accent/5 text-accent border-accent/20">
                  <Sparkles className="h-3 w-3" aria-hidden />
                  Category: {category}
                  <button
                    type="button"
                    onClick={() => handleFilterChange("category", ALL)}
                    className="rounded hover:bg-accent/10"
                    aria-label="Clear category filter"
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                </Badge>
              )}
              {search !== "" && (
                <Badge variant="outline" className="gap-1.5 bg-primary/5 text-primary border-primary/20">
                  <Search className="h-3 w-3" aria-hidden />
                  Search: {search}
                  <button
                    type="button"
                    onClick={() => {
                      setSearchInput("");
                      setFilters((prev) => ({ ...prev, search: "" }));
                    }}
                    className="rounded hover:bg-primary/10"
                    aria-label="Clear search"
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                </Badge>
              )}
              <Button variant="ghost" size="sm" onClick={clearFilters} className="ml-auto">
                <X className="h-3.5 w-3.5 mr-1.5" aria-hidden />
                Clear all
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tickets List */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-4 p-6" aria-label="Loading tickets" aria-busy="true">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex animate-pulse items-center gap-3 border-b border-border p-4 last:border-0">
                  <div className="h-8 w-8 shrink-0 rounded bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-1/4 rounded bg-muted" />
                    <div className="h-3 w-1/2 rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="p-12 text-center">
              <h3 className="mb-1 text-lg font-medium text-foreground">Couldn&apos;t load tickets</h3>
              <p className="mb-4 text-muted-foreground">{error}</p>
              <Button variant="outline" onClick={() => window.location.reload()}>
                Retry
              </Button>
            </div>
          ) : tickets.length === 0 ? (
            <div className="p-12 text-center">
              {view === "sent" ? (
                <>
                  <Send className="mx-auto mb-4 h-12 w-12 text-muted-foreground" aria-hidden />
                  <h3 className="mb-1 text-lg font-medium text-foreground">No sent tickets</h3>
                  <p className="mb-4 text-muted-foreground">
                    Tickets you send to another department will appear here with their approval status.
                  </p>
                </>
              ) : (
                <>
                  <TicketCheck className="mx-auto mb-4 h-12 w-12 text-muted-foreground" aria-hidden />
                  <h3 className="mb-1 text-lg font-medium text-foreground">No tickets found</h3>
                  <p className="mb-4 text-muted-foreground">
                    {hasActiveFilters || view !== "all"
                      ? "Try adjusting your filters or view"
                      : "Get started by creating a new ticket"}
                  </p>
                </>
              )}
              {hasActiveFilters || (view !== "all" && view !== "sent") ? (
                <Button variant="outline" onClick={() => { clearFilters(); handleViewChange("all"); }}>
                  Clear filters
                </Button>
              ) : (
                <Link href="/dashboard/tickets/new">
                  <Button>
                    <Plus className="mr-2 h-4 w-4" aria-hidden />
                    New Ticket
                  </Button>
                </Link>
              )}
            </div>
          ) : (
            <>
              <div className="border-b border-border px-4 py-3">
                <p className="text-sm text-muted-foreground" role="status">
                  {pagination.total} ticket{pagination.total !== 1 ? "s" : ""}
                  {hasActiveFilters ? " matching filters" : ""}
                </p>
              </div>
              {currentUserId && currentUserRole ? (
                <>
                  {/* Dense table on sm+; cards on phones. */}
                  <div className="hidden sm:block">
                    <TicketTable
                      tickets={tickets as any}
                      currentUserId={currentUserId}
                      currentUserRole={currentUserRole}
                      currentDepartmentId={session?.user?.departmentId as string | undefined}
                      onChanged={() => setRefreshKey((k) => k + 1)}
                    />
                  </div>
                  <div className="space-y-3 p-4 sm:hidden">
                    <TicketList
                      tickets={tickets as any}
                      variant="compact"
                      hrefFor={(t) => ticketHref(t)}
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-3 p-4">
                  <TicketList
                    tickets={tickets as any}
                    variant="compact"
                    hrefFor={(t) => ticketHref(t)}
                  />
                </div>
              )}

              {pagination.totalPages > 1 && (
                <div className="flex flex-col gap-3 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    Showing {(pagination.page - 1) * pagination.limit + 1} to{" "}
                    {Math.min(pagination.page * pagination.limit, pagination.total)} of{" "}
                    {pagination.total} tickets
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground" aria-live="polite">
                      Page {pagination.page} of {pagination.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(pagination.page - 1)}
                      disabled={pagination.page === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(pagination.page + 1)}
                      disabled={pagination.page === pagination.totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
