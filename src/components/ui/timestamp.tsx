"use client";

import { format, formatDistanceToNow } from "date-fns";

interface TimestampProps {
  date: Date | string;
  /** "relative" (default) renders "3h ago"; "date" renders "Sep 28, 2026". */
  mode?: "relative" | "date";
  className?: string;
}

/**
 * Relative time ("3h ago") that reveals the absolute local time on hover,
 * wrapped in <time datetime> so the precise value stays machine-readable.
 * mode="date" shows the absolute date up front instead.
 */
export function Timestamp({ date, mode = "relative", className }: TimestampProps) {
  const d = new Date(date);

  return (
    <time
      dateTime={d.toISOString()}
      title={format(d, "MMM d, yyyy · HH:mm")}
      className={className}
    >
      {mode === "date" ? format(d, "MMM d, yyyy") : formatDistanceToNow(d, { addSuffix: true })}
    </time>
  );
}
