"use client";

import React, { useState } from "react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/toast";
import {
  User,
  Copy,
  Mail,
  Link2,
  Ticket,
  UserCheck,
  Shield,
  Power,
  Trash2,
  ExternalLink,
  Briefcase,
} from "lucide-react";

export interface TeamMemberContextMenuMember {
  _id: any;
  name: string;
  email?: string;
  role?: string;
  departmentId?: any;
  active?: boolean;
  avatar?: string;
  [key: string]: any;
}

export interface TeamMemberContextMenuProps<T extends TeamMemberContextMenuMember = TeamMemberContextMenuMember> {
  member: T;
  currentUserId?: string;
  currentUserRole?: string;
  currentUserDepartmentId?: string;
  activeTicket?: {
    _id: string;
    ticketNumber: string;
    title?: string;
  };
  onViewProfile?: (member: T) => void;
  onAssignTicket?: (memberId: string) => Promise<void> | void;
  onChangeRole?: (memberId: string, newRole: string) => Promise<void> | void;
  onToggleActive?: (member: T) => Promise<void> | void;
  onDeleteMember?: (member: T) => Promise<void> | void;
  disabled?: boolean;
  children: React.ReactNode;
}

const ROLE_OPTIONS = [
  { value: "super_admin", label: "Super Admin", icon: Shield },
  { value: "manager", label: "Manager", icon: Briefcase },
  { value: "team", label: "Team Member (Agent)", icon: UserCheck },
  { value: "client", label: "Client", icon: User },
];

export function TeamMemberContextMenu<T extends TeamMemberContextMenuMember = TeamMemberContextMenuMember>({
  member,
  currentUserId,
  currentUserRole = "client",
  currentUserDepartmentId,
  activeTicket,
  onViewProfile,
  onAssignTicket,
  onChangeRole,
  onToggleActive,
  onDeleteMember,
  disabled = false,
  children,
}: TeamMemberContextMenuProps<T>) {
  const router = useRouter();
  const { toast } = useToast();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const memberId = member._id?.toString?.() || "";
  const isSelf = currentUserId && memberId ? currentUserId === memberId : false;
  const isSuperAdmin = currentUserRole === "super_admin";
  const isManager = currentUserRole === "manager";

  // Check department membership
  const memberDeptId =
    typeof member.departmentId === "object"
      ? member.departmentId?._id?.toString?.()
      : member.departmentId?.toString?.();
  const isInSameDept =
    currentUserDepartmentId && memberDeptId
      ? currentUserDepartmentId === memberDeptId
      : false;

  // Authorization rules matching /api/users/[id]:
  // - Super admin can manage anyone except delete self or delete super admin.
  // - Managers can manage agents in their own department (cannot modify super_admin, manager, or users outside dept).
  // - Nobody can change their own role or deactivate/delete themselves.
  const canManageRole =
    !isSelf &&
    (isSuperAdmin ||
      (isManager &&
        isInSameDept &&
        member.role === "team"));

  const canToggleActive =
    !isSelf &&
    (isSuperAdmin ||
      (isManager &&
        isInSameDept &&
        member.role === "team"));

  const canDelete =
    isSuperAdmin &&
    !isSelf &&
    member.role !== "super_admin";

  const handleCopyName = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(member.name);
      toast({
        title: "Name copied",
        description: `${member.name} copied to clipboard`,
      });
    } catch {
      toast({ title: "Failed to copy name", variant: "destructive" });
    }
  };

  const handleCopyEmail = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!member.email) return;
    try {
      await navigator.clipboard.writeText(member.email);
      toast({
        title: "Email copied",
        description: `${member.email} copied to clipboard`,
      });
    } catch {
      toast({ title: "Failed to copy email", variant: "destructive" });
    }
  };

  const handleCopyProfileLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const link = `${window.location.origin}/dashboard/users?search=${encodeURIComponent(
        member.email || member.name
      )}`;
      await navigator.clipboard.writeText(link);
      toast({
        title: "Profile link copied",
        description: "Direct user filter link copied to clipboard",
      });
    } catch {
      toast({ title: "Failed to copy link", variant: "destructive" });
    }
  };

  const handleViewTickets = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/dashboard/tickets?assigneeId=${memberId}`);
  };

  const handleAssignActiveTicket = async () => {
    if (!onAssignTicket) return;
    try {
      await onAssignTicket(memberId);
      toast({
        title: "Ticket assigned",
        description: `Assigned ${activeTicket?.ticketNumber || "ticket"} to ${member.name}`,
      });
    } catch (err) {
      toast({
        title: "Assignment failed",
        description: err instanceof Error ? err.message : "Failed to assign ticket",
        variant: "destructive",
      });
    }
  };

  const handleRoleChange = async (newRole: string) => {
    if (!onChangeRole || newRole === member.role) return;
    try {
      await onChangeRole(memberId, newRole);
      toast({
        title: "Role updated",
        description: `${member.name} is now ${newRole.replace("_", " ")}`,
      });
    } catch (err) {
      toast({
        title: "Role change failed",
        description: err instanceof Error ? err.message : "Failed to update role",
        variant: "destructive",
      });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!onDeleteMember) return;
    setIsDeleting(true);
    try {
      await onDeleteMember(member);
      setShowDeleteConfirm(false);
      toast({
        title: "Member removed",
        description: `${member.name} has been deleted`,
      });
    } catch (err) {
      toast({
        title: "Removal failed",
        description: err instanceof Error ? err.message : "Failed to delete user",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  if (disabled) {
    return <>{children}</>;
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuLabel className="flex items-center justify-between gap-2 truncate">
            <span className="truncate font-semibold">{member.name}</span>
            <span className="text-[10px] font-mono uppercase text-muted-foreground">
              {member.role?.replace("_", " ") || "user"}
            </span>
          </ContextMenuLabel>
          <ContextMenuSeparator />

          {/* View Profile */}
          <ContextMenuItem
            onClick={() => {
              if (onViewProfile) {
                onViewProfile(member);
              } else {
                router.push(
                  `/dashboard/users?search=${encodeURIComponent(
                    member.email || member.name
                  )}`
                );
              }
            }}
          >
            <User className="h-4 w-4 text-muted-foreground" />
            <span>View Member Profile</span>
          </ContextMenuItem>

          {/* Copy Name */}
          <ContextMenuItem onClick={handleCopyName}>
            <Copy className="h-4 w-4 text-muted-foreground" />
            <span>Copy Name</span>
          </ContextMenuItem>

          {/* Copy Email */}
          {member.email && (
            <ContextMenuItem onClick={handleCopyEmail}>
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span>Copy Email</span>
            </ContextMenuItem>
          )}

          {/* Copy Profile Link */}
          <ContextMenuItem onClick={handleCopyProfileLink}>
            <Link2 className="h-4 w-4 text-muted-foreground" />
            <span>Copy Profile Link</span>
          </ContextMenuItem>

          {/* Quick Assign Active Ticket (if active ticket context provided) */}
          {activeTicket && onAssignTicket && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={handleAssignActiveTicket}>
                <UserCheck className="h-4 w-4 text-primary" />
                <span className="font-medium text-primary">
                  Assign {activeTicket.ticketNumber}
                </span>
              </ContextMenuItem>
            </>
          )}

          {/* View Assigned Tickets */}
          <ContextMenuSeparator />
          <ContextMenuItem onClick={handleViewTickets}>
            <Ticket className="h-4 w-4 text-muted-foreground" />
            <span>View Assigned Tickets</span>
          </ContextMenuItem>

          {/* Change Role Submenu */}
          {canManageRole && onChangeRole && (
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <Shield className="h-4 w-4 text-muted-foreground" />
                <span>Change Role</span>
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-48">
                {ROLE_OPTIONS.filter((opt) => {
                  if (isSuperAdmin) return true;
                  if (isManager) return opt.value === "team";
                  return false;
                }).map((opt) => (
                  <ContextMenuItem
                    key={opt.value}
                    onClick={() => handleRoleChange(opt.value)}
                    className={member.role === opt.value ? "font-semibold bg-accent/50" : ""}
                  >
                    <opt.icon className="h-4 w-4 text-muted-foreground" />
                    <span>{opt.label}</span>
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
          )}

          {/* Activate / Deactivate */}
          {canToggleActive && onToggleActive && (
            <ContextMenuItem onClick={() => onToggleActive(member)}>
              <Power className="h-4 w-4 text-muted-foreground" />
              <span>{member.active ? "Deactivate Member" : "Activate Member"}</span>
            </ContextMenuItem>
          )}

          {/* Delete Member (Destructive) */}
          {canDelete && onDeleteMember && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                variant="destructive"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
                <span>Remove Member</span>
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>

      {/* Removal Confirmation Alert Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {member.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this user from TicketFlow? This will permanently delete the user account. If this user has active tickets or comments, deactivate the account instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteConfirm();
              }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Removing…" : "Remove Member"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
