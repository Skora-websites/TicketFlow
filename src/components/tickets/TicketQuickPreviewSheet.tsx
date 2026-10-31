"use client";

import * as React from "react";
import Link from "next/link";
import { formatDistanceToNow, format } from "date-fns";
import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetDescription,
  BottomSheetBody,
  BottomSheetFooter,
  BottomSheetSnapControls,
} from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  StatusBadge,
  PriorityBadge,
  CategoryBadge,
  DepartmentBadge,
  UserAvatar,
  TicketNumber,
} from "./badges";
import { ticketHref } from "./TicketCard";
import {
  ExternalLink,
  Calendar,
  User,
  Tag,
  Building,
  Clock,
  ArrowRight,
  Shield,
  Layers,
  ArrowRightLeft,
} from "lucide-react";
import type { IUser, IDepartment } from "@/lib/db/models";

export interface PreviewTicket {
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
  createdAt: Date | string;
  updatedAt?: Date | string;
  closedAt?: Date | string;
  transfer?: {
    status?: string;
    direction?: string;
    fromId?: { _id?: string; name?: string; role?: string } | null;
    toUserId?: { _id?: string; name?: string } | null;
    toManagerId?: { _id?: string; name?: string } | null;
    toDepartmentId?: { _id?: string; name?: string; color?: string } | null;
  } | null;
}

interface TicketQuickPreviewSheetProps {
  ticket: PreviewTicket | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// 3 snap points: 0.35 (compact peek), 0.65 (intermediate details), 0.95 (full expanded overview)
const SNAP_POINTS = [0.35, 0.65, 0.95];

export function TicketQuickPreviewSheet({
  ticket,
  open,
  onOpenChange,
}: TicketQuickPreviewSheetProps) {
  const [activeSnapPoint, setActiveSnapPoint] = React.useState<
    number | string | null
  >(SNAP_POINTS[0]);

  // When a new ticket opens, start at intermediate or compact
  React.useEffect(() => {
    if (open) {
      setActiveSnapPoint(SNAP_POINTS[1]); // default to 0.65 for a great initial peek
    }
  }, [open, ticket?._id]);

  if (!ticket) return null;

  const requester = ticket.requesterId;
  const assignee = ticket.assigneeId;
  const department = ticket.departmentId;
  const createdDate = new Date(ticket.createdAt);
  const timeAgo = formatDistanceToNow(createdDate, { addSuffix: true });
  const href = ticketHref(ticket);

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      snapPoints={SNAP_POINTS}
      activeSnapPoint={activeSnapPoint}
      setActiveSnapPoint={setActiveSnapPoint}
    >
      <BottomSheetContent
        className="bg-card text-card-foreground border-border"
        showHandle={true}
        showCloseButton={true}
      >
        {/* Header - Always visible across all snap points */}
        <BottomSheetHeader className="border-b border-border/60 pb-3">
          <div className="flex items-center justify-between pr-8">
            <div className="flex items-center gap-2">
              <TicketNumber
                ticketNumber={ticket.ticketNumber}
                className="text-xs font-mono font-bold"
              />
              <StatusBadge status={ticket.status} />
              <PriorityBadge priority={ticket.priority} />
            </div>
            {/* Quick snap switcher */}
            <BottomSheetSnapControls
              labels={["Peek", "Details", "Full"]}
              className="hidden sm:inline-flex"
            />
          </div>
          <BottomSheetTitle className="mt-1 line-clamp-2 text-base font-bold text-foreground">
            {ticket.title}
          </BottomSheetTitle>
          <BottomSheetDescription className="flex items-center gap-2 text-xs text-muted-foreground">
            <CategoryBadge category={ticket.category} />
            <span>•</span>
            <span className="font-mono">{timeAgo}</span>
          </BottomSheetDescription>
        </BottomSheetHeader>

        {/* Scrollable Body: Content reveals progressively as user drags upward */}
        <BottomSheetBody className="space-y-4 pt-3">
          {/* Snap level hint for mobile user */}
          <div className="flex items-center justify-between text-[11px] text-muted-foreground border-b border-border/30 pb-2 sm:hidden">
            <span>Drag sheet up for full details</span>
            <BottomSheetSnapControls labels={["Peek", "Mid", "Full"]} />
          </div>

          {/* Quick Info Grid */}
          <div className="grid grid-cols-2 gap-2.5">
            {/* Requester */}
            <div className="rounded-xl border border-border/70 bg-muted/30 p-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                <User className="h-3 w-3" />
                Customer
              </div>
              <div className="flex items-center gap-2">
                <UserAvatar
                  name={requester?.name || "Customer"}
                  size="sm"
                  avatar={requester?.avatar}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">
                    {requester?.name || "Customer"}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {requester?.email || "No email"}
                  </p>
                </div>
              </div>
            </div>

            {/* Assignee */}
            <div className="rounded-xl border border-border/70 bg-muted/30 p-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                <Shield className="h-3 w-3" />
                Assignee
              </div>
              {assignee ? (
                <div className="flex items-center gap-2">
                  <UserAvatar
                    name={assignee.name}
                    size="sm"
                    avatar={assignee.avatar}
                    role={assignee.role as any}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">
                      {assignee.name}
                    </p>
                    <p className="truncate text-[10px] text-muted-foreground capitalize">
                      {assignee.role?.replace("_", " ")}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic mt-1">
                  Unassigned
                </p>
              )}
            </div>
          </div>

          {/* Department if any */}
          {department && (
            <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-xs">
              <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
                <Building className="h-3.5 w-3.5" />
                Department
              </span>
              <DepartmentBadge name={department.name} color={department.color} />
            </div>
          )}

          {/* Transfer status if any */}
          {ticket.transfer?.status && (
            <div className="rounded-xl border border-border/60 bg-accent/10 p-3 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-accent mb-1">
                <ArrowRightLeft className="h-3.5 w-3.5" />
                Transfer Status: {ticket.transfer.status}
              </div>
              <p className="text-muted-foreground text-[11px]">
                {ticket.transfer.toDepartmentId?.name
                  ? `Routing to ${ticket.transfer.toDepartmentId.name}`
                  : ticket.transfer.toUserId?.name
                  ? `Direct transfer to ${ticket.transfer.toUserId.name}`
                  : "Department transfer in progress"}
              </p>
            </div>
          )}

          {/* Description Section */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Description
            </h4>
            <div className="rounded-xl border border-border/60 bg-background p-3 text-xs leading-relaxed text-foreground whitespace-pre-wrap max-h-48 overflow-y-auto">
              {ticket.description || "No description provided."}
            </div>
          </div>

          {/* Timestamps */}
          <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Created: {format(createdDate, "MMM d, yyyy h:mm a")}
            </span>
          </div>
        </BottomSheetBody>

        {/* Footer with full navigation */}
        <BottomSheetFooter className="border-t border-border/60">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto"
          >
            Dismiss
          </Button>
          <Button asChild size="sm" className="w-full sm:w-auto gap-2 font-semibold">
            <Link href={href}>
              Open Full Ticket
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </BottomSheetFooter>
      </BottomSheetContent>
    </BottomSheet>
  );
}
