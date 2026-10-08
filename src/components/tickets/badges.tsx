"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Tag,
  Copy,
  Check,
  ArrowLeftRight,
  Clock,
  CircleCheck,
  CircleX,
} from "lucide-react";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const statusConfig: Record<string, { label: string; class: string; dot: string }> = {
    open: { label: "Open", class: "status-open", dot: "bg-info" },
    in_progress: { label: "In Progress", class: "status-in_progress", dot: "bg-warning" },
    on_hold: { label: "On Hold", class: "status-on_hold", dot: "bg-accent" },
    resolved: { label: "Resolved", class: "status-resolved", dot: "bg-success" },
    closed: { label: "Closed", class: "status-closed", dot: "bg-muted-foreground/50" },
  };

  const config = statusConfig[status] ?? { label: status, class: "", dot: "bg-muted-foreground/50" };

  return (
    <Badge className={cn(config.class, className)} variant="outline">
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", config.dot)} aria-hidden />
      {config.label}
    </Badge>
  );
}

interface PriorityBadgeProps {
  priority: string;
  className?: string;
}

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  const priorityConfig: Record<string, { label: string; class: string; dot: string }> = {
    low: { label: "Low", class: "priority-low", dot: "bg-info" },
    medium: { label: "Medium", class: "priority-medium", dot: "bg-warning" },
    high: { label: "High", class: "priority-high", dot: "bg-destructive" },
    urgent: { label: "Urgent", class: "priority-urgent", dot: "bg-destructive" },
  };

  const config = priorityConfig[priority] ?? { label: priority, class: "", dot: "bg-muted-foreground/50" };

  return (
    <Badge className={cn(config.class, className)} variant="outline">
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", config.dot)} aria-hidden />
      {config.label}
    </Badge>
  );
}

interface CategoryBadgeProps {
  category: string;
  className?: string;
}

// Categories are dynamic (seeded defaults + super-admin additions), so the
// label is derived from the slug: "development" -> "Development".
export function CategoryBadge({ category, className }: CategoryBadgeProps) {
  const label = category
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");

  return (
    <Badge variant="secondary" className={cn("gap-1", className)}>
      <Tag className="h-3 w-3" aria-hidden />
      {label}
    </Badge>
  );
}

interface TransferStatusBadgeProps {
  status?: string;
  className?: string;
}

export function TransferStatusBadge({ status, className }: TransferStatusBadgeProps) {
  if (!status) return null;
  // Token classes (not inline hexes) so the tints track the active theme —
  // same recipe as the .status-* utilities in globals.css.
  const config: Record<string, { label: string; Icon: any; className: string }> = {
    pending: { label: "Transfer pending", Icon: Clock, className: "bg-warning-muted text-warning border-warning/20" },
    approved: { label: "Transfer approved", Icon: CircleCheck, className: "bg-success-muted text-success border-success/20" },
    rejected: { label: "Transfer rejected", Icon: CircleX, className: "bg-destructive-muted text-destructive border-destructive/20" },
  };
  const c = config[status] ?? { label: status, Icon: ArrowLeftRight, className: "" };
  const Icon = c.Icon;
  return (
    <Badge variant="outline" className={cn("gap-1", c.className, className)}>
      <Icon className="h-3 w-3" aria-hidden />
      {c.label}
    </Badge>
  );
}

interface DepartmentBadgeProps {
  name: string;
  color: string;
  className?: string;
}

export function DepartmentBadge({ name, color, className }: DepartmentBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-[hsl(var(--dept-development))] border-opacity-30",
        className
      )}
      style={{
        borderColor: color,
        color: color,
        backgroundColor: `${color}1A`,
      }}
    >
      {name}
    </Badge>
  );
}

interface UserAvatarProps {
  name: string;
  email?: string;
  role?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function UserAvatar({ name, email, role, className, size = "md" }: UserAvatarProps) {
  // Defensive: undefined/empty names crash .split() and unmount whole pages
  // (seen when an optimistic assignee patch briefly carried a raw id string).
  const initials = (name || "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const sizeClasses = {
    sm: "w-6 h-6 text-xs",
    md: "w-8 h-8 text-sm",
    lg: "w-10 h-10 text-base",
  };

  // Flat semantic role colors — cobalt intensity encodes authority;
  // no gradients (chroma only where it carries meaning).
  const roleColors: Record<string, string> = {
    super_admin: "bg-primary text-primary-foreground",
    manager: "bg-primary-muted text-primary",
    team: "bg-secondary text-secondary-foreground",
    client: "bg-muted text-muted-foreground",
  };

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full font-medium",
        sizeClasses[size],
        role ? roleColors[role] : "bg-muted text-muted-foreground",
        className
      )}
      title={email}
    >
      {initials}
    </div>
  );
}

interface TicketNumberProps {
  ticketNumber: string;
  className?: string;
}

export function TicketNumber({ ticketNumber, className }: TicketNumberProps) {
  const [copied, setCopied] = useState(false);

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(ticketNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard unavailable — no-op
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      title={`Copy ${ticketNumber}`}
      aria-label={`Copy ticket number ${ticketNumber}`}
      className={cn(
        "group inline-flex items-center gap-1 font-mono font-medium text-muted-foreground transition-colors hover:text-foreground",
        className
      )}
    >
      {ticketNumber}
      {copied ? (
        <Check className="h-3 w-3 text-success" aria-hidden />
      ) : (
        <Copy className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" aria-hidden />
      )}
    </button>
  );
}