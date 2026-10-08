"use client";

import { cn } from "@/lib/utils";

interface PayloadEntry {
  name?: string | number;
  value?: number | string;
  color?: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: PayloadEntry[];
  label?: string | number;
  labelFormatter?: (label: string | number) => string;
  valueFormatter?: (value: number | string, name?: string | number) => string;
  className?: string;
}

/**
 * Shared Recharts tooltip: popover surface, tabular numerals, color key.
 * Usage: <Tooltip content={<ChartTooltip />} cursor={false} />
 */
export function ChartTooltip({
  active,
  payload,
  label,
  labelFormatter,
  valueFormatter,
  className,
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md",
        className
      )}
    >
      {label !== undefined && label !== "" && (
        <p className="mb-1 font-medium text-foreground">
          {labelFormatter ? labelFormatter(label) : label}
        </p>
      )}
      <div className="space-y-0.5">
        {payload.map((entry, i) => (
          <p key={i} className="flex items-center gap-1.5 text-muted-foreground">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color }}
              aria-hidden
            />
            <span className="capitalize">{entry.name}</span>
            <span className="ml-auto pl-3 font-mono font-medium tabular-nums text-foreground">
              {valueFormatter ? valueFormatter(entry.value ?? "", entry.name) : entry.value}
            </span>
          </p>
        ))}
      </div>
    </div>
  );
}
