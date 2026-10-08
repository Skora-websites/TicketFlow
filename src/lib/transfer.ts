// Pure helpers for the department-to-department ticket transfer flow.
// Kept free of server-only imports so both API routes and regression tests
// can use them directly.

export interface TransferRef {
  status?: string;
  fromId?: unknown; // ObjectId | string
  toDepartmentId?: unknown;
  toUserId?: unknown; // ObjectId | string | null
  toManagerId?: unknown;
  direction?: string;
}

export interface TransferActor {
  id: string;
  role: string;
  departmentId?: string;
}

const idStr = (v: unknown): string | undefined | null => {
  if (v === undefined) return undefined;
  if (v === null) return null;
  return typeof v === "string" ? v : String(v);
};

/**
 * Whether this user is on the receiving side of the transfer — i.e. a manager
 * of the target department (or the explicitly-addressed manager). Receiving
 * managers see pending transfers on their dashboard and decide them.
 * Managers-only by design: department-to-department handoffs are settled
 * between the two managers; super admins oversee but never decide.
 */
export function isReceivingManager(user: TransferActor, transfer?: TransferRef | null): boolean {
  if (!transfer) return false;
  if (user.role !== "manager") return false;
  const targetDept = idStr(transfer.toDepartmentId);
  if (!!user.departmentId && !!targetDept && user.departmentId === targetDept) return true;
  // Explicitly addressed manager (direction="manager") even in edge cases
  // where their departmentId is missing from the session.
  return idStr(transfer.toManagerId) === user.id;
}

/** Can this user approve/reject the pending transfer right now? */
export function canDecideTransfer(user: TransferActor, transfer?: TransferRef | null): boolean {
  if (!transfer || transfer.status !== "pending") return false;
  return isReceivingManager(user, transfer);
}

/**
 * Project-wide priority rule: priority is chosen by the SENDER of record and
 * read-only for everyone else — the filer for regular tickets, the dispatching
 * user for transferred ones. On transferred tickets the lock applies to the
 * whole receiving side (managers and agents alike).
 */
export function isPriorityLockedFor(user: TransferActor, transfer?: TransferRef | null): boolean {
  if (!transfer) return false;
  return idStr(transfer.fromId) !== user.id;
}

/**
 * Can this internal user set a ticket's priority?
 *  - transferred ticket: only the original sender (transfer.fromId)
 *  - regular ticket: only the filer (requester) — for team/manager/super_admin
 *    alike. Nobody else can override the sender's chosen urgency.
 */
export function canSetPriority(
  user: TransferActor,
  ticket: { requesterId?: unknown; transfer?: unknown }
): boolean {
  const transfer = toTransferRef(ticket.transfer);
  if (transfer) {
    return idStr(transfer.fromId) === user.id;
  }
  return idStr(ticket.requesterId) === user.id;
}

/**
 * Conversation participation (the chat panel). The chat on a ticket is between
 * exactly three parties:
 *   1. the SENDER of record (filer — or the dispatching user on transfers),
 *   2. the MANAGER of the department that owns the ticket (or the explicitly
 *      addressed/receiving manager while a transfer is pending),
 *   3. the AGENT working on it (the assignee).
 * Super admins additionally have a seat in EVERY conversation: they can read
 * and post anywhere. Managers of other departments are outside the chat too.
 * Clients keep their existing rule: they chat on their own tickets only.
 * Lives in transfer.ts (server-safe) so both API routes and client components
 * can share one rule.
 */
export function isConversationParticipant(
  user: TransferActor,
  ticket: {
    requesterId?: unknown;
    assigneeId?: unknown;
    departmentId?: unknown;
    transfer?: unknown;
  }
): boolean {
  if (user.role === "client") {
    return idStr(ticket.requesterId) === user.id;
  }

  if (user.role === "team") {
    if (idStr(ticket.requesterId) === user.id || idStr(ticket.assigneeId) === user.id) return true;
    // The user who dispatched the ticket elsewhere stays in its conversation.
    return idStr(toTransferRef(ticket.transfer)?.fromId) === user.id;
  }

  if (user.role === "manager") {
    // The sending manager keeps their seat in the conversation.
    if (idStr(toTransferRef(ticket.transfer)?.fromId) === user.id) return true;
    // Receiving / explicitly-addressed manager on a transferred ticket.
    if (isReceivingManager(user, toTransferRef(ticket.transfer))) return true;
    // Otherwise: the manager of the department that currently owns the ticket.
    const dept = idStr(ticket.departmentId);
    return !!dept && !!user.departmentId && dept === user.departmentId;
  }

  // Super admin: full oversight — can join (read + post) any conversation.
  if (user.role === "super_admin") return true;

  // Any other role: read-only oversight, no posting.
  return false;
}

export const TRANSFER_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

export const TRANSFER_DIRECTIONS = ["agent", "manager"] as const;
export type TransferDirectionValue = (typeof TRANSFER_DIRECTIONS)[number];

/**
 * Normalize a lean/mongoose transfer subdoc into the plain string-shape the
 * authz helpers and client components expect.
 */
export function toTransferRef(transfer: unknown): TransferRef | null {
  if (!transfer || typeof transfer !== "object") return null;
  const t = transfer as Record<string, unknown>;
  return {
    status: typeof t.status === "string" ? t.status : undefined,
    fromId: t.fromId ?? undefined,
    toDepartmentId: t.toDepartmentId ?? undefined,
    toUserId: t.toUserId ?? null,
    toManagerId: t.toManagerId ?? null,
    direction: typeof t.direction === "string" ? t.direction : undefined,
  };
}
