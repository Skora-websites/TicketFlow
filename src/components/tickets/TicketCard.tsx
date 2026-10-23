"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
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
        <TicketNumber ticketNumber={ticket.ticketNumber} className="hidden shrink-0 font-bold sm:inline-flex" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-foreground text-sm">{ticket.title}</p>
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
              <UserAvatar name={assignee.name} size="sm" avatar={assignee.avatar} />
            </span>
          )}
          <span className="whitespace-nowrap font-mono text-xs">{timeAgo}</span>
        </div>
      </div>
    );

    const classes = cn(
      "flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 shadow-sm transition-all duration-150 hover:border-foreground/30 hover:shadow-md",
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

  // Tabela Dual-Column Card Layout (As seen in Dribbble reference)
  const body = (
    <div className="flex flex-col gap-3.5 sm:gap-4">
      {/* Top row: Status Badge & Identifier */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-2.5 sm:pb-3">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground font-mono">
            {ticket.ticketNumber}
          </span>
          {showDepartment && department && (
            <DepartmentBadge name={department.name} color={department.color} />
          )}
        </div>
        <StatusBadge status={ticket.status} />
      </div>

      {/* Dual Column Content */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 sm:gap-4">
        {/* Left column: Customer / Requester Information */}
        <div className="space-y-2 border-b border-border/60 pb-3 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-4">
          <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Customer Information
          </p>
          <div className="flex items-center gap-2.5">
            <UserAvatar name={requester?.name || "Customer"} size="md" avatar={requester?.avatar} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs sm:text-sm font-semibold text-foreground">
                {requester?.name || "Customer"}
              </p>
              <p className="truncate text-[11px] sm:text-xs text-muted-foreground">
                {requester?.email || "No email provided"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5 sm:pt-1">
            <span className="inline-flex h-6 sm:h-7 items-center rounded-lg border border-border/80 bg-secondary/50 px-2 sm:px-2.5 text-[10px] sm:text-[11px] font-semibold text-foreground">
              Contact
            </span>
            <CategoryBadge category={ticket.category} />
          </div>
        </div>

        {/* Right column: Ticket Details */}
        <div className="space-y-2">
          <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Ticket Info
          </p>
          <div>
            <h4 className="line-clamp-2 sm:line-clamp-1 text-xs sm:text-sm font-bold text-foreground">
              {ticket.title}
            </h4>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] sm:text-xs text-muted-foreground">
              <span>Priority: <span className="font-semibold capitalize text-foreground">{ticket.priority}</span></span>
              <span>Time: <span className="font-mono text-foreground">{timeAgo}</span></span>
            </div>
          </div>
          <div className="flex items-center justify-between pt-1">
            {assignee ? (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <UserAvatar name={assignee.name} size="sm" avatar={assignee.avatar} />
                <span className="truncate max-w-[120px] font-medium text-foreground">{assignee.name}</span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">Unassigned</span>
            )}
            <span className="inline-flex h-7 sm:h-8 items-center rounded-xl bg-white px-3 sm:px-3.5 text-xs font-semibold text-[#121212] shadow-xs transition-transform active:scale-95 hover:bg-[#E9E7E8]">
              View
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  const classes = cn(
    "block rounded-2xl border border-border bg-card p-3.5 sm:p-5 shadow-2xs transition-all duration-150 hover:border-foreground/30 hover:shadow-xs",
    (href || onClick) && "cursor-pointer active:bg-secondary/20",
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

export function TicketCardSkeleton({
  variant = "default",
  className,
}: {
  variant?: "default" | "compact";
  className?: string;
}) {
  if (variant === "compact") {
    return (
      <div
        className={cn(
          "flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 shadow-sm",
          className
        )}
      >
        <Skeleton className="hidden sm:inline-flex h-5 w-20 rounded-md" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-3/5 rounded-md" />
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="hidden md:inline-flex h-5 w-20 rounded-full" />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Skeleton className="hidden sm:inline-flex h-6 w-6 rounded-full" />
          <Skeleton className="h-3.5 w-14 rounded-md" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "block rounded-2xl border border-border bg-card p-3.5 sm:p-5 shadow-2xs",
        className
      )}
    >
      <div className="flex flex-col gap-3.5 sm:gap-4">
        {/* Top row: Status Badge & Identifier */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-2.5 sm:pb-3">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <Skeleton className="h-4 w-20 rounded-md" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>

        {/* Dual Column Content */}
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 sm:gap-4">
          {/* Left column: Customer Information */}
          <div className="space-y-2 border-b border-border/60 pb-3 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-4">
            <Skeleton className="h-3 w-28 rounded-md" />
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-24 rounded-md" />
                <Skeleton className="h-3 w-36 rounded-md" />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5 sm:pt-1">
              <Skeleton className="h-6 sm:h-7 w-16 rounded-lg" />
              <Skeleton className="h-6 sm:h-7 w-20 rounded-lg" />
            </div>
          </div>

          {/* Right column: Ticket Details */}
          <div className="space-y-2">
            <Skeleton className="h-3 w-20 rounded-md" />
            <div>
              <Skeleton className="h-4 w-4/5 rounded-md" />
              <div className="mt-2 flex items-center gap-3">
                <Skeleton className="h-3 w-20 rounded-md" />
                <Skeleton className="h-3 w-16 rounded-md" />
              </div>
            </div>
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-1.5">
                <Skeleton className="h-5 w-5 rounded-full" />
                <Skeleton className="h-3 w-20 rounded-md" />
              </div>
              <Skeleton className="h-7 sm:h-8 w-16 rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

