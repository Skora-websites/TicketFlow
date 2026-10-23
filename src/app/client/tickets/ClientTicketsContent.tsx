"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { TicketList, ticketHref, TicketCardSkeleton } from "@/components/tickets";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, TicketCheck } from "lucide-react";
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
}

export function ClientTicketsContent() {
  const [tickets, setTickets] = useState<TicketWithRelations[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchTickets() {
      try {
        const res = await fetch("/api/tickets?view=mine");
        if (!res.ok) throw new Error("Failed to fetch tickets");
        const data = await res.json();
        setTickets(data.tickets);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load tickets");
      } finally {
        setIsLoading(false);
      }
    }
    fetchTickets();
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-6" aria-label="Loading tickets" aria-busy="true">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Skeleton className="h-8 w-36 rounded-md mb-2" />
            <Skeleton className="h-4 w-28 rounded-md" />
          </div>
          <Skeleton className="w-full sm:w-36 h-9.5 sm:h-8.5 rounded-lg" />
        </div>

        {/* Tickets List */}
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <TicketCardSkeleton key={i} variant="default" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <TicketCheck className="w-12 h-12 text-destructive mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">Failed to load tickets</h2>
        <p className="text-muted-foreground mb-4">{error}</p>
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-header-title">My Tickets</h1>
          <p className="page-header-sub" role="status">
            {tickets.length} ticket{tickets.length !== 1 ? "s" : ""} total
          </p>
        </div>
        <Link href="/client/tickets/new" className="w-full sm:w-auto">
          <Button className="w-full sm:w-auto h-9.5 sm:h-8.5 font-bold">
            <Plus className="w-4 h-4 mr-2" />
            Create Ticket
          </Button>
        </Link>
      </div>

      {/* Tickets List */}
      <div className="space-y-4">
        {tickets.length === 0 ? (
          <div className="text-center py-12">
            <TicketCheck className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-1">No tickets yet</h3>
            <p className="text-muted-foreground mb-4">Create your first ticket to get started</p>
            <Link href="/client/tickets/new">
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Create Ticket
              </Button>
            </Link>
          </div>
        ) : (
          <TicketList
            tickets={tickets}
            variant="default"
            emptyMessage="No tickets found"
            hrefFor={(t) => ticketHref(t, "/client/tickets")}
          />
        )}
      </div>
    </div>
  );
}