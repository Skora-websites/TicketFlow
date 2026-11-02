"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Plus, RefreshCw, Filter, Layers } from "lucide-react";

export interface KanbanColumnContextMenuProps {
  status: string;
  statusLabel: string;
  ticketCount: number;
  onNewTicket?: (status: string) => void;
  onRefresh?: () => void;
  onFilterStatus?: (status: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
}

export function KanbanColumnContextMenu({
  status,
  statusLabel,
  ticketCount,
  onNewTicket,
  onRefresh,
  onFilterStatus,
  disabled = false,
  children,
}: KanbanColumnContextMenuProps) {
  const router = useRouter();

  const handleCreateTicket = () => {
    if (onNewTicket) {
      onNewTicket(status);
      return;
    }
    router.push(`/dashboard/tickets/new?status=${encodeURIComponent(status)}`);
  };

  if (disabled) {
    return <>{children}</>;
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuLabel className="flex items-center justify-between text-xs font-semibold">
          <span className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-primary" />
            <span>{statusLabel} Column</span>
          </span>
          <span className="font-mono text-muted-foreground">
            {ticketCount} {ticketCount === 1 ? "ticket" : "tickets"}
          </span>
        </ContextMenuLabel>
        <ContextMenuSeparator />

        <ContextMenuItem onClick={handleCreateTicket}>
          <Plus className="h-4 w-4 text-primary" />
          <span>New Ticket in {statusLabel}</span>
        </ContextMenuItem>

        {onFilterStatus && (
          <ContextMenuItem onClick={() => onFilterStatus(status)}>
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span>Filter to {statusLabel}</span>
          </ContextMenuItem>
        )}

        {onRefresh && (
          <ContextMenuItem onClick={() => onRefresh()}>
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
            <span>Refresh Board</span>
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
