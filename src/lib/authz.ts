import "server-only";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { isReceivingManager, type TransferRef } from "@/lib/transfer";

export async function getUser() {
  const session = await auth();
  return session?.user;
}

export async function requireRole(...allowedRoles: string[]) {
  const session = await auth();
  
  if (!session?.user) {
    redirect("/login");
  }

  if (!allowedRoles.includes(session.user.role)) {
    redirect("/unauthorized");
  }

  return session.user;
}

export async function requireAuth() {
  const session = await auth();
  
  if (!session?.user) {
    redirect("/login");
  }

  return session.user;
}

export type SessionUser = NonNullable<Awaited<ReturnType<typeof getUser>>>;

// For API route handlers: returns a 401/403 JSON response on auth failure
// instead of redirecting (redirect produces a 307 HTML response that breaks
// fetch() callers expecting JSON).
export async function requireApiRole(...allowedRoles: string[]): Promise<SessionUser | NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!allowedRoles.includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return session.user;
}

export function canAccessTicket(
  userRole: string,
  userId: string,
  ticketRequesterId: string,
  ticketAssigneeId?: string,
  ticketDepartmentId?: string,
  userDepartmentId?: string,
  ticketTransfer?: TransferRef | null,
  // Agents with "assigned" scope lose the department-wide view (defaults to
  // "department" so legacy callers keep the old behavior).
  userTicketAccess?: "department" | "assigned"
): boolean {
  if (userRole === "super_admin") return true;

  if (userRole === "client") {
    return ticketRequesterId === userId;
  }

  if (userRole === "team") {
    // Team members always see tickets assigned to them and tickets they filed
    // themselves. Agents granted "department" access (set by their manager at
    // account creation) also see their department's tickets.
    if (ticketAssigneeId === userId || ticketRequesterId === userId) return true;
    if (
      (userTicketAccess ?? "department") === "department" &&
      !!userDepartmentId &&
      !!ticketDepartmentId &&
      ticketDepartmentId === userDepartmentId
    ) {
      return true;
    }
    return false;
  }

  if (userRole === "manager") {
    // Inter-department transfers: the receiving manager (target department)
    // can see the ticket while it is pending approval, even though it is not
    // (yet) in their department and not assigned to anyone on their team.
    if (isReceivingManager({ id: userId, role: userRole, departmentId: userDepartmentId }, ticketTransfer)) {
      return true;
    }
    // Department tickets: both IDs must be defined and equal; a dept-less
    // manager may only access tickets assigned to them.
    if (userDepartmentId && ticketDepartmentId) {
      return ticketDepartmentId === userDepartmentId;
    }
    // Orphaned tickets (departmentId never set — e.g. routing matched no
    // department) were previously invisible to EVERY manager, which stranded
    // them forever. They surface ONLY to department managers while unassigned
    // (treated as triage work), and afterwards only to the assignee. This
    // widening is deliberately tiny: it cannot see tickets that belong to
    // another department, and super_admin oversight is unchanged.
    if (userDepartmentId && !ticketDepartmentId) {
      return !ticketAssigneeId || ticketAssigneeId === userId;
    }
    return ticketAssigneeId === userId;
  }

  return false;
}

// Escapes user input before it is used as a Mongo $regex value, preventing
// regex injection and ReDoS from crafted search strings.
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Bounded, escaped search string for Mongo $regex queries.
export function sanitizeSearch(value: unknown, maxLength = 100): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return escapeRegExp(trimmed.slice(0, maxLength));
}

/**
 * Status-transition permission. Status is writable ONLY by managers and the
 * assigned agent — nobody else (not super admins, not the filing agent).
 * Clients are the one exception: they may reopen their own resolved/closed
 * ticket (client module — unchanged).
 */
export function canTransitionStatus(
  userRole: string,
  currentStatus: string,
  newStatus: string,
  isOwner: boolean,
  isAssignee = false
): boolean {
  if (userRole === "manager") return true;

  if (userRole === "client") {
    return isOwner && (currentStatus === "resolved" || currentStatus === "closed") && newStatus === "open";
  }

  if (userRole === "team") {
    // An agent who merely filed/requested the ticket cannot drive its status —
    // only the agent it is assigned to can.
    if (!isAssignee) return false;
    const allowedTransitions: Record<string, string[]> = {
      open: ["in_progress", "on_hold"],
      in_progress: ["on_hold", "resolved", "open"],
      on_hold: ["in_progress", "open"],
      resolved: ["closed", "open"],
      closed: ["open"],
    };
    return allowedTransitions[currentStatus]?.includes(newStatus) ?? false;
  }

  return false;
}