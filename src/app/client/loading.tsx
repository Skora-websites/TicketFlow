import { Skeleton } from "@/components/ui/skeleton";
import { TicketCardSkeleton } from "@/components/tickets";

export default function ClientLoading() {
  return (
    <div className="space-y-6 animate-fade-in" aria-label="Loading tickets" aria-busy="true">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Skeleton className="h-8 w-36 rounded-md mb-2" />
          <Skeleton className="h-4 w-28 rounded-md" />
        </div>
        <Skeleton className="w-full sm:w-36 h-9.5 sm:h-8.5 rounded-lg" />
      </div>

      {/* Tickets List Skeletons */}
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <TicketCardSkeleton key={i} variant="default" />
        ))}
      </div>
    </div>
  );
}
