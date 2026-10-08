"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import {
  StatusBadge,
  PriorityBadge,
  CategoryBadge,
  DepartmentBadge,
  UserAvatar,
  TicketNumber,
} from "./badges";
import type { IUser as UserType, IDepartment as Department } from "@/lib/db/models";

export interface TicketCardTicket {
  _id?: string | { toString(): string };
  ticketNumber: string;
  title: string;
  description?: string;
  category: string;
  priority: string;
  status: string;
  createdAt: Date | string;
  updatedAt?: Date | string;
  closedAt?: Date | string;
  requesterId?: UserType;
  assigneeId?: UserType;
  departmentId?: Department;
  transfer?: {
    status?: string;
    direction?: string;
    fromId?: { _id?: string; name?: string; role?: string } | null;
    toUserId?: { _id?: string; name?: string } | null;
    toManagerId?: { _id?: string; name?: string } | null;
    toDepartmentId?: { _id?: string; name?: string } | null;
  } | null;
}

interface TicketCardProps {
  ticket: TicketCardTicket;
  variant?: "default" | "compact" | "detailed";
  showDepartment?: boolean;
  showRequester?: boolean;
  href?: string;
  onClick?: () => void;
  className?: string;
}

export function TicketCard({
  ticket,
  variant = "default",
  showDepartment = true,
  showRequester = false,
  href,
  onClick,
  className,
}: TicketCardProps) {
  const requester = ticket.requesterId as UserType | undefined;
  const assignee = ticket.assigneeId as UserType | undefined;
  const department = ticket.departmentId as Department | undefined;
  const updatedAt = ticket.updatedAt ?? ticket.createdAt;
  const timeAgo = formatDistanceToNow(new Date(updatedAt), { addSuffix: true });

  if (variant === "compact") {
    const body = (
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <TicketNumber ticketNumber={ticket.ticketNumber} className="hidden shrink-0 sm:inline-flex" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-foreground">{ticket.title}</p>
          <div className="mt-1 flex items-center gap-1.5">
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
            <span className="hidden md:inline-flex">
              <CategoryBadge category={ticket.category} />
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
          {assignee && (
            <span className="hidden sm:inline-flex" title={`Assigned to ${assignee.name}`}>
              <UserAvatar name={assignee.name} size="sm" />
            </span>
          )}
          <span className="whitespace-nowrap font-mono text-xs">{timeAgo}</span>
        </div>
      </div>
    );

    const classes = cn(
      "flex items-center gap-3 rounded-xl border border-border/50 bg-card p-3 transition-colors hover:border-primary/30 hover:bg-muted/40",
      (href || onClick) && "cursor-pointer",
      className
    );

    if (href) {
      return (
        <Link href={href} className={classes} aria-label={`${ticket.ticketNumber}: ${ticket.title}`}>
          {body}
        </Link>
      );
    }
    return (
      <div className={classes} onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}>
        {body}
      </div>
    );
  }

  const body = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
      <div className="flex shrink-0 flex-row items-center gap-2 sm:flex-col sm:items-start">
        <TicketNumber ticketNumber={ticket.ticketNumber} className="text-sm" />
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="mb-1 line-clamp-1 font-semibold text-foreground">{ticket.title}</h3>
        {ticket.description && (
          <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">{ticket.description}</p>
        )}

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <CategoryBadge category={ticket.category} />
          {showDepartment && department && (
            <DepartmentBadge name={department.name} color={department.color} />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
          {showRequester && requester && (
            <div className="flex items-center gap-1.5">
              <UserAvatar name={requester.name} size="sm" />
              <span className="truncate">{requester.name}</span>
            </div>
          )}
          {assignee && (
            <div className="flex items-center gap-1.5">
              <UserAvatar name={assignee.name} size="sm" />
              <span className="truncate">{assignee.name}</span>
            </div>
          )}
          <span className="font-mono text-xs">{timeAgo}</span>
        </div>
      </div>
    </div>
  );

  const classes = cn(
    "block rounded-xl border border-border/50 bg-card p-4 transition-colors hover:border-primary/30 hover:bg-muted/40 sm:p-5",
    (href || onClick) && "cursor-pointer",
    className
  );

  if (href) {
    return (
      <Link href={href} className={classes} aria-label={`${ticket.ticketNumber}: ${ticket.title}`}>
        {body}
      </Link>
    );
  }
  return (
    <div className={classes} onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}>
      {body}
    </div>
  );
}

interface TicketListProps {
  tickets: TicketCardTicket[];
  emptyMessage?: string;
  variant?: "default" | "compact";
  hrefFor?: (ticket: TicketCardTicket) => string;
  className?: string;
}

export function ticketHref(ticket: TicketCardTicket, base = "/dashboard/tickets") {
  const id = typeof ticket._id === "string" ? ticket._id : ticket._id?.toString();
  return id ? `${base}/${id}` : `${base}?search=${encodeURIComponent(ticket.ticketNumber)}`;
}

export function TicketList({
  tickets,
  emptyMessage = "No tickets found",
  variant = "default",
  hrefFor,
  className,
}: TicketListProps) {
  if (tickets.length === 0) {
    return (
      <div className="py-12 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <svg className="h-8 w-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
        </div>
        <p className="text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {tickets.map((ticket) => (
        <TicketCard
          key={ticket._id?.toString() ?? ticket.ticketNumber}
          ticket={ticket}
          variant={variant}
          href={hrefFor?.(ticket)}
        />
      ))}
    </div>
  );
}
