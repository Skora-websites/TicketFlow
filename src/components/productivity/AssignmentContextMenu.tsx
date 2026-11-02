"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useToast } from "@/components/ui/toast";
import {
  User,
  UserCheck,
  UserX,
  Copy,
  Mail,
  Ticket,
  ExternalLink,
  Lock,
} from "lucide-react";

export interface AssignmentMember {
  _id: any;
  name: string;
  email?: string;
  role?: string;
  avatar?: string;
  [key: string]: any;
}

export interface AssignmentContextMenuProps {
  ticket: {
    _id: any;
    ticketNumber: string;
    title?: string;
    status?: string;
    assigneeId?: any;
    [key: string]: any;
  };
  currentUserId?: string;
  currentUserRole?: string;
  teamMembers?: AssignmentMember[];
  onAssign?: (assigneeId: string | null) => Promise<void> | void;
  onViewProfile?: (member: any) => void;
  disabled?: boolean;
  children: React.ReactNode;
}

export function AssignmentContextMenu({
  ticket,
  currentUserId,
  currentUserRole = "client",
  teamMembers = [],
  onAssign,
  onViewProfile,
  disabled = false,
  children,
}: AssignmentContextMenuProps) {
  const router = useRouter();
  const { toast } = useToast();

  const assigneeObj =
    typeof ticket.assigneeId === "object" ? ticket.assigneeId : null;
  const assigneeIdStr =
    assigneeObj?._id?.toString?.() ||
    (typeof ticket.assigneeId === "string" ? ticket.assigneeId : null);
  const assigneeName = assigneeObj?.name || (assigneeIdStr ? "Assigned Agent" : "Unassigned");
  const assigneeEmail = assigneeObj?.email;

  const isClosed = ticket.status === "closed";
  const isManager = currentUserRole === "manager";
  const isSuperAdmin = currentUserRole === "super_admin";

  // Assignment power: manager can assign/reassign. Super admins forward unassigned tickets to managers.
  const canAssign = !isClosed && (isManager || isSuperAdmin);

  const handleCopyDetails = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!assigneeIdStr) return;
    try {
      const details = assigneeEmail
        ? `${assigneeName} <${assigneeEmail}>`
        : assigneeName;
      await navigator.clipboard.writeText(details);
      toast({
        title: "Assignee details copied",
        description: `${details} copied to clipboard`,
      });
    } catch {
      toast({ title: "Failed to copy details", variant: "destructive" });
    }
  };

  const handleCopyEmail = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!assigneeEmail) return;
    try {
      await navigator.clipboard.writeText(assigneeEmail);
      toast({
        title: "Email copied",
        description: `${assigneeEmail} copied to clipboard`,
      });
    } catch {
      toast({ title: "Failed to copy email", variant: "destructive" });
    }
  };

  const handleViewProfile = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!assigneeIdStr) return;
    if (onViewProfile && assigneeObj) {
      onViewProfile(assigneeObj);
    } else {
      router.push(
        `/dashboard/users?search=${encodeURIComponent(assigneeEmail || assigneeName)}`
      );
    }
  };

  const handleViewTickets = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!assigneeIdStr) return;
    router.push(`/dashboard/tickets?assigneeId=${assigneeIdStr}`);
  };

  const handleReassign = async (newAssigneeId: string | null) => {
    if (!onAssign) return;
    try {
      await onAssign(newAssigneeId);
      const targetName =
        newAssigneeId === null
          ? "Unassigned"
          : teamMembers.find((m) => m._id === newAssigneeId)?.name || "Agent";
      toast({
        title: newAssigneeId ? "Ticket reassigned" : "Ticket unassigned",
        description: `${ticket.ticketNumber} is now ${
          newAssigneeId ? `assigned to ${targetName}` : "unassigned"
        }`,
      });
    } catch (err) {
      toast({
        title: "Assignment failed",
        description: err instanceof Error ? err.message : "Failed to change assignment",
        variant: "destructive",
      });
    }
  };

  if (disabled) {
    return <>{children}</>;
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuLabel className="flex items-center justify-between gap-1.5 truncate">
          <span className="truncate font-semibold">
            {assigneeIdStr ? assigneeName : "Unassigned"}
          </span>
          {isClosed && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Lock className="h-3 w-3" /> Closed
            </span>
          )}
        </ContextMenuLabel>
        <ContextMenuSeparator />

        {/* When ticket has an assignee */}
        {assigneeIdStr && (
          <>
            {/* Copy Assignee Details */}
            <ContextMenuItem onClick={handleCopyDetails}>
              <Copy className="h-4 w-4 text-muted-foreground" />
              <span>Copy Assignee Details</span>
            </ContextMenuItem>

            {/* Copy Assignee Email */}
            {assigneeEmail && (
              <ContextMenuItem onClick={handleCopyEmail}>
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>Copy Email</span>
              </ContextMenuItem>
            )}

            {/* View Assignee Profile */}
            <ContextMenuItem onClick={handleViewProfile}>
              <User className="h-4 w-4 text-muted-foreground" />
              <span>View Assignee Profile</span>
            </ContextMenuItem>

            {/* View Other Tickets Assigned to this Member */}
            <ContextMenuItem onClick={handleViewTickets}>
              <Ticket className="h-4 w-4 text-muted-foreground" />
              <span>View Assigned Tickets</span>
            </ContextMenuItem>

            <ContextMenuSeparator />
          </>
        )}

        {/* Reassign / Assign to member submenu */}
        {canAssign && onAssign && (
          <>
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <UserCheck className="h-4 w-4 text-muted-foreground" />
                <span>{assigneeIdStr ? "Reassign Ticket" : "Assign Ticket to…"}</span>
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-52 max-h-56 overflow-y-auto">
                {teamMembers.length === 0 ? (
                  <ContextMenuItem disabled>No members available</ContextMenuItem>
                ) : (
                  teamMembers.map((member) => (
                    <ContextMenuItem
                      key={member._id}
                      onClick={() => handleReassign(member._id)}
                      className={member._id === assigneeIdStr ? "font-semibold bg-accent/50" : ""}
                    >
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate">{member.name}</span>
                    </ContextMenuItem>
                  ))
                )}
              </ContextMenuSubContent>
            </ContextMenuSub>

            {/* Remove Assignee (Unassign) */}
            {assigneeIdStr && (
              <ContextMenuItem
                onClick={() => handleReassign(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <UserX className="h-4 w-4 text-muted-foreground" />
                <span>Remove Assignee</span>
              </ContextMenuItem>
            )}
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
