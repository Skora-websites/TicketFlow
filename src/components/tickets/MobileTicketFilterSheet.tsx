"use client";

import * as React from "react";
import {
  BottomSheet,
  BottomSheetTrigger,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetDescription,
  BottomSheetBody,
  BottomSheetFooter,
  BottomSheetSnapControls,
} from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Filter,
  Search,
  X,
  Check,
  Flag,
  Sparkles,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ALL = "all";

export interface MobileTicketFilterSheetProps {
  status: string;
  priority: string;
  category: string;
  search: string;
  categories: { slug: string; name: string }[];
  isManagerOrAdmin: boolean;
  onFilterChange: (key: "status" | "priority" | "category", value: string) => void;
  onClearFilters: () => void;
  totalResultsCount?: number;
}

const SNAP_POINTS = [0.5, 0.9];

export function MobileTicketFilterSheet({
  status,
  priority,
  category,
  search,
  categories,
  isManagerOrAdmin,
  onFilterChange,
  onClearFilters,
  totalResultsCount,
}: MobileTicketFilterSheetProps) {
  const [open, setOpen] = React.useState(false);
  const [activeSnapPoint, setActiveSnapPoint] = React.useState<
    number | string | null
  >(SNAP_POINTS[0]);

  const activeFiltersCount =
    (status !== ALL ? 1 : 0) +
    (priority !== ALL ? 1 : 0) +
    (category !== ALL ? 1 : 0) +
    (search.trim() !== "" ? 1 : 0);

  const statuses = [
    { value: ALL, label: "All" },
    { value: "open", label: "Open" },
    { value: "in_progress", label: "In Progress" },
    { value: "on_hold", label: "On Hold" },
    { value: "resolved", label: "Resolved" },
    { value: "closed", label: "Closed" },
  ];

  const priorities = [
    { value: ALL, label: "All" },
    { value: "urgent", label: "Urgent", color: "text-destructive border-destructive/30" },
    { value: "high", label: "High", color: "text-destructive/80 border-destructive/30" },
    { value: "medium", label: "Medium", color: "text-warning border-warning/30" },
    { value: "low", label: "Low", color: "text-info border-info/30" },
  ];

  return (
    <BottomSheet
      open={open}
      onOpenChange={setOpen}
      snapPoints={SNAP_POINTS}
      activeSnapPoint={activeSnapPoint}
      setActiveSnapPoint={setActiveSnapPoint}
    >
      <BottomSheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="relative gap-2 h-9 px-3 font-semibold rounded-xl border-border bg-card shadow-xs"
          aria-label={`Open filters. ${activeFiltersCount} active`}
        >
          <Filter className="h-4 w-4 text-primary" aria-hidden />
          <span>Filters</span>
          {activeFiltersCount > 0 && (
            <Badge
              variant="default"
              className="ml-0.5 h-5 min-w-5 px-1.5 text-[10px] font-bold rounded-full bg-primary text-primary-foreground"
            >
              {activeFiltersCount}
            </Badge>
          )}
        </Button>
      </BottomSheetTrigger>

      <BottomSheetContent
        className="bg-card text-card-foreground border-border"
        showHandle={true}
        showCloseButton={true}
      >
        <BottomSheetHeader className="border-b border-border/60 pb-3">
          <div className="flex items-center justify-between pr-8">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-primary" />
              <BottomSheetTitle className="text-base font-bold">
                Filter Tickets
              </BottomSheetTitle>
              {activeFiltersCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {activeFiltersCount} active
                </Badge>
              )}
            </div>
            <BottomSheetSnapControls labels={["Quick", "Full"]} />
          </div>
          <BottomSheetDescription className="text-xs text-muted-foreground">
            Swipe down to close or drag up to configure all filter options.
          </BottomSheetDescription>
        </BottomSheetHeader>

        <BottomSheetBody className="space-y-4 pt-3">
          {/* Status Chips */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Status
            </label>
            <div className="flex flex-wrap gap-1.5">
              {statuses.map((s) => {
                const isSelected = status === s.value;
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => onFilterChange("status", s.value)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-all active:scale-95",
                      isSelected
                        ? "border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary/40 shadow-xs"
                        : "border-border/80 bg-muted/20 text-foreground hover:bg-muted/40"
                    )}
                    aria-pressed={isSelected}
                  >
                    {isSelected && <Check className="h-3 w-3" />}
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Priority Chips */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Priority
            </label>
            <div className="flex flex-wrap gap-1.5">
              {priorities.map((p) => {
                const isSelected = priority === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => onFilterChange("priority", p.value)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-all active:scale-95",
                      isSelected
                        ? "border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary/40 shadow-xs"
                        : "border-border/80 bg-muted/20 text-foreground hover:bg-muted/40",
                      p.color && !isSelected && p.color
                    )}
                    aria-pressed={isSelected}
                  >
                    {isSelected && <Check className="h-3 w-3" />}
                    <Flag className="h-3 w-3 opacity-70" />
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Category Filter (if manager/admin) */}
          {isManagerOrAdmin && (
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Category
              </label>
              <Select
                value={category}
                onValueChange={(v) => onFilterChange("category", v)}
              >
                <SelectTrigger className="w-full h-10 rounded-xl" aria-label="Select category">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent className="max-h-56">
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

          {/* Active summary & Clear Action */}
          {activeFiltersCount > 0 && (
            <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 p-2.5 text-xs">
              <span className="text-muted-foreground">
                {activeFiltersCount} filter{activeFiltersCount > 1 ? "s" : ""} applied
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearFilters}
                className="h-7 text-xs text-destructive hover:bg-destructive/10"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Reset filters
              </Button>
            </div>
          )}
        </BottomSheetBody>

        <BottomSheetFooter className="border-t border-border/60">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpen(false)}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => setOpen(false)}
            className="w-full sm:w-auto font-semibold"
          >
            Apply Filters {totalResultsCount !== undefined ? `(${totalResultsCount})` : ""}
          </Button>
        </BottomSheetFooter>
      </BottomSheetContent>
    </BottomSheet>
  );
}
