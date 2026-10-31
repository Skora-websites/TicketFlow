import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 animate-fade-in" aria-label="Loading page" aria-busy="true">
      {/* Header Skeleton */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between pb-1">
        <div>
          <Skeleton className="h-7 sm:h-8 w-40 rounded-lg" />
          <Skeleton className="mt-1.5 h-3.5 w-64 sm:w-80 rounded-md" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-28 rounded-xl" />
          <Skeleton className="h-9 w-28 rounded-xl" />
        </div>
      </div>

      {/* Metric Cards Skeleton */}
      <div className="rounded-lg border border-border bg-card shadow-xs overflow-hidden">
        <div className="grid grid-cols-2 divide-y sm:divide-y-0 sm:grid-cols-3 lg:grid-cols-5 divide-border">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="p-3.5 sm:p-4">
              <Skeleton className="h-3 w-20 rounded" />
              <Skeleton className="mt-2 h-7 w-12 rounded" />
              <Skeleton className="mt-2 h-3 w-24 rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* Main Content Area Grid Skeleton */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-4">
          <Skeleton className="h-5 w-32 rounded-md" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4 rounded" />
            <Skeleton className="h-4 w-1/2 rounded" />
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-4">
          <Skeleton className="h-5 w-32 rounded-md" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4 rounded" />
            <Skeleton className="h-4 w-1/2 rounded" />
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-4">
          <Skeleton className="h-5 w-32 rounded-md" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4 rounded" />
            <Skeleton className="h-4 w-1/2 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}
