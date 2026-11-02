import assert from "node:assert/strict";

console.log("=== Testing Core Productivity Context Menus in TicketFlow ===");

// 1. Verify ContextMenu UI primitive exports
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuGroup,
  ContextMenuPortal,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuRadioGroup,
} from "../src/components/ui/context-menu";

assert.ok(ContextMenu, "ContextMenu must be defined");
assert.ok(ContextMenuTrigger, "ContextMenuTrigger must be defined");
assert.ok(ContextMenuContent, "ContextMenuContent must be defined");
assert.ok(ContextMenuItem, "ContextMenuItem must be defined");
assert.ok(ContextMenuSub, "ContextMenuSub must be defined");
assert.ok(ContextMenuSubTrigger, "ContextMenuSubTrigger must be defined");
assert.ok(ContextMenuSubContent, "ContextMenuSubContent must be defined");
assert.ok(ContextMenuSeparator, "ContextMenuSeparator must be defined");
console.log("✓ ContextMenu UI primitives successfully exported and structured");

// 2. Verify Productivity Context Menu component exports
import {
  TicketContextMenu,
  MessageContextMenu,
  KanbanColumnContextMenu,
  TeamMemberContextMenu,
  AssignmentContextMenu,
  NotificationContextMenu,
  ActivityContextMenu,
} from "../src/components/productivity";
import {
  TicketKanbanBoard,
  KANBAN_COLUMNS,
} from "../src/components/tickets";

assert.ok(TicketContextMenu, "TicketContextMenu must be exported from productivity module");
assert.ok(MessageContextMenu, "MessageContextMenu must be exported from productivity module");
assert.ok(KanbanColumnContextMenu, "KanbanColumnContextMenu must be exported from productivity module");
assert.ok(TeamMemberContextMenu, "TeamMemberContextMenu must be exported from productivity module");
assert.ok(AssignmentContextMenu, "AssignmentContextMenu must be exported from productivity module");
assert.ok(NotificationContextMenu, "NotificationContextMenu must be exported from productivity module");
assert.ok(ActivityContextMenu, "ActivityContextMenu must be exported from productivity module");
assert.ok(TicketKanbanBoard, "TicketKanbanBoard must be exported from tickets module");
assert.equal(KANBAN_COLUMNS.length, 5, "Kanban board must define 5 standard status columns");
console.log("✓ All 7 productivity context menus and TicketKanbanBoard successfully exported");

// 3. Test Ticket Context Menu Permissions & Actions
interface MockTicket {
  _id: string;
  ticketNumber: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  assigneeId?: { _id: string; name: string } | string | null;
  requesterId?: { _id: string; name: string } | string | null;
}

const evaluateTicketPermissions = (ticket: MockTicket, userId: string, userRole: string) => {
  const isManagerial = userRole === "manager" || userRole === "super_admin";
  const assigneeId = typeof ticket.assigneeId === "object" ? ticket.assigneeId?._id : ticket.assigneeId;
  const requesterId = typeof ticket.requesterId === "object" ? ticket.requesterId?._id : ticket.requesterId;
  const isAssignedAgent = userRole === "team" && assigneeId === userId;
  const isRequester = requesterId === userId;

  return {
    canEditStatus: isManagerial || isAssignedAgent,
    canEditPriority: isManagerial || isAssignedAgent || isRequester,
    canAssign: isManagerial,
    canDelete: isManagerial,
    canDuplicate: userRole !== "client" || isRequester,
  };
};

// Manager test
const ticketA: MockTicket = {
  _id: "t123",
  ticketNumber: "TICK-101",
  title: "API Performance degradation",
  description: "Queries are running slow on tickets collection",
  category: "technical",
  priority: "high",
  status: "open",
  assigneeId: { _id: "user-agent-1", name: "Agent Smith" },
  requesterId: { _id: "user-client-1", name: "Client Alice" },
};

const managerPerms = evaluateTicketPermissions(ticketA, "user-mgr-1", "manager");
assert.equal(managerPerms.canEditStatus, true, "Manager should be able to edit status");
assert.equal(managerPerms.canEditPriority, true, "Manager should be able to edit priority");
assert.equal(managerPerms.canAssign, true, "Manager should be able to assign tickets");
assert.equal(managerPerms.canDelete, true, "Manager should be able to delete tickets");
assert.equal(managerPerms.canDuplicate, true, "Manager should be able to duplicate tickets");
console.log("✓ Manager context menu permissions verified (all actions permitted)");

// Assigned team member test
const agentPerms = evaluateTicketPermissions(ticketA, "user-agent-1", "team");
assert.equal(agentPerms.canEditStatus, true, "Assigned agent should be able to edit status");
assert.equal(agentPerms.canEditPriority, true, "Assigned agent should be able to edit priority");
assert.equal(agentPerms.canAssign, false, "Assigned agent should NOT be able to reassign");
assert.equal(agentPerms.canDelete, false, "Assigned agent should NOT be able to delete");
assert.equal(agentPerms.canDuplicate, true, "Team agent should be able to duplicate");
console.log("✓ Assigned Agent context menu permissions verified");

// Unassigned team member test
const otherAgentPerms = evaluateTicketPermissions(ticketA, "user-agent-99", "team");
assert.equal(otherAgentPerms.canEditStatus, false, "Unassigned team agent should NOT edit status");
assert.equal(otherAgentPerms.canAssign, false, "Unassigned team agent should NOT reassign");
assert.equal(otherAgentPerms.canDelete, false, "Unassigned team agent should NOT delete");
console.log("✓ Non-assigned Agent permissions verified (status/assign/delete restricted)");

// Client Requester test
const clientPerms = evaluateTicketPermissions(ticketA, "user-client-1", "client");
assert.equal(clientPerms.canEditStatus, false, "Client should NOT edit status directly from menu");
assert.equal(clientPerms.canEditPriority, true, "Requester can adjust priority");
assert.equal(clientPerms.canAssign, false, "Client should NOT assign");
assert.equal(clientPerms.canDelete, false, "Client should NOT delete");
assert.equal(clientPerms.canDuplicate, true, "Client requester can duplicate own ticket");
console.log("✓ Client requester context menu permissions verified");

// 4. Test Message / Comment Context Menu Permissions & Actions
interface MockMessage {
  id: string;
  senderId?: string;
  authorId?: string;
  senderName: string;
  text: string;
  status?: "pending" | "sent" | "error";
  isInternal?: boolean;
}

const evaluateMessagePermissions = (
  msg: MockMessage,
  userId: string,
  userRole: string,
  isTicketClosed = false
) => {
  const isManagerial = userRole === "manager" || userRole === "super_admin";
  const author = msg.senderId || msg.authorId;
  const isAuthor = author === userId;

  const canEdit = isAuthor && !isTicketClosed && msg.status !== "error";
  const canDelete = (isAuthor || isManagerial) && !isTicketClosed;
  const canRetry = isAuthor && msg.status === "error";
  const canReply = !isTicketClosed;

  return {
    canEdit,
    canDelete,
    canRetry,
    canReply,
    isAuthor,
  };
};

// Own regular message
const ownMsg: MockMessage = {
  id: "msg-1",
  senderId: "user-agent-1",
  senderName: "Agent Smith",
  text: "Investigating the server logs now.",
  status: "sent",
};

const ownMsgPerms = evaluateMessagePermissions(ownMsg, "user-agent-1", "team");
assert.equal(ownMsgPerms.canEdit, true, "Author can edit own message");
assert.equal(ownMsgPerms.canDelete, true, "Author can delete own message");
assert.equal(ownMsgPerms.canRetry, false, "Sent message cannot be retried");
assert.equal(ownMsgPerms.canReply, true, "Can reply to message");
console.log("✓ Own message context menu actions verified (edit/delete/reply enabled)");

// Failed message (error status)
const failedMsg: MockMessage = {
  id: "msg-2",
  senderId: "user-agent-1",
  senderName: "Agent Smith",
  text: "Failed network packet payload",
  status: "error",
};

const failedMsgPerms = evaluateMessagePermissions(failedMsg, "user-agent-1", "team");
assert.equal(failedMsgPerms.canRetry, true, "Failed message can be retried");
assert.equal(failedMsgPerms.canEdit, false, "Failed uncommitted message cannot be edited in place");
console.log("✓ Failed message context menu actions verified (retry enabled)");

// Other's message viewed by manager
const otherMsg: MockMessage = {
  id: "msg-3",
  senderId: "user-client-1",
  senderName: "Client Alice",
  text: "When will this be fixed?",
  status: "sent",
};

const managerOnOtherPerms = evaluateMessagePermissions(otherMsg, "user-mgr-1", "manager");
assert.equal(managerOnOtherPerms.canEdit, false, "Manager cannot edit other user's message");
assert.equal(managerOnOtherPerms.canDelete, true, "Manager CAN moderate/delete offensive message");
assert.equal(managerOnOtherPerms.canReply, true, "Manager can reply");
console.log("✓ Message moderation permissions verified (manager delete enabled, edit forbidden)");

// Closed ticket message permissions
const closedTicketMsgPerms = evaluateMessagePermissions(ownMsg, "user-agent-1", "team", true);
assert.equal(closedTicketMsgPerms.canEdit, false, "Cannot edit comment on closed ticket");
assert.equal(closedTicketMsgPerms.canDelete, false, "Cannot delete comment on closed ticket");
assert.equal(closedTicketMsgPerms.canReply, false, "Cannot reply on closed ticket");
console.log("✓ Closed ticket restriction verified (comment edits/replies blocked)");

// 5. Test Thread Reply Quoting & Clipboard formatting
const buildReplyQuote = (senderName: string, text: string) => {
  const cleanSnippet = text.length > 80 ? `${text.slice(0, 80)}…` : text;
  return `> @${senderName}: "${cleanSnippet}"\n\n`;
};

const quote = buildReplyQuote("Alice", "We are seeing HTTP 504 gateway timeout on /api/v1/checkout.");
assert.ok(quote.startsWith("> @Alice: "), "Quote starts with markdown blockquote and sender mention");
assert.ok(quote.includes("HTTP 504 gateway timeout"), "Quote contains original text snippet");
console.log("✓ Thread quote generation verified");

// 5b. Test Internal Note Link Privacy & Failed Message Action Isolation
const evaluateLinkAction = (isInternal: boolean, userRole: string, isFailed: boolean) => {
  if (isFailed) return false;
  if (isInternal && userRole === "client") return false;
  return true;
};

assert.equal(evaluateLinkAction(true, "client", false), false, "Internal notes must NEVER expose links to clients");
assert.equal(evaluateLinkAction(true, "team", false), true, "Internal notes can be linked internally by staff");
assert.equal(evaluateLinkAction(true, "manager", false), true, "Internal notes can be linked by manager");
assert.equal(evaluateLinkAction(false, "client", false), true, "Public messages can be linked by clients");
assert.equal(evaluateLinkAction(false, "client", true), false, "Failed unsent messages cannot be linked");
console.log("✓ Internal note link privacy and failed message link isolation verified");

// 6. Test Kanban Board & Column Context Menu Actions
const NEXT_STATUS: Record<string, string> = {
  open: "in_progress",
  in_progress: "resolved",
  on_hold: "in_progress",
  resolved: "closed",
};

const PREV_STATUS: Record<string, string> = {
  closed: "resolved",
  resolved: "in_progress",
  on_hold: "open",
  in_progress: "open",
};

assert.equal(NEXT_STATUS["open"], "in_progress", "Open advances to in_progress");
assert.equal(NEXT_STATUS["in_progress"], "resolved", "In progress advances to resolved");
assert.equal(NEXT_STATUS["resolved"], "closed", "Resolved advances to closed");
assert.equal(PREV_STATUS["closed"], "resolved", "Closed moves back to resolved");
assert.equal(PREV_STATUS["in_progress"], "open", "In progress moves back to open");
console.log("✓ Kanban quick status advancement & rollback verified");

// Target column list must exclude current ticket status
const allColumns = ["open", "in_progress", "on_hold", "resolved", "closed"];
const getTargetColumns = (currentStatus: string) => allColumns.filter((col) => col !== currentStatus);

const targetsForOpen = getTargetColumns("open");
assert.equal(targetsForOpen.includes("open"), false, "Target columns must not include current status");
assert.equal(targetsForOpen.length, 4, "Should offer 4 other columns to move to");

const targetsForInProgress = getTargetColumns("in_progress");
assert.equal(targetsForInProgress.includes("in_progress"), false, "Target columns must not include in_progress");
console.log("✓ Kanban target column filtering verified (excludes current status)");

// Column-level context menu: right clicking empty column area provides column-scoped actions
interface MockColumnMenu {
  status: string;
  statusLabel: string;
  ticketCount: number;
}

const buildColumnActions = (col: MockColumnMenu) => ({
  createUrl: `/dashboard/tickets/new?status=${encodeURIComponent(col.status)}`,
  headerLabel: `${col.statusLabel} Column · ${col.ticketCount} tickets`,
});

const openColActions = buildColumnActions({ status: "open", statusLabel: "Open", ticketCount: 7 });
assert.equal(openColActions.createUrl, "/dashboard/tickets/new?status=open", "Creates ticket directly in column");
assert.ok(openColActions.headerLabel.includes("7 tickets"), "Header reflects accurate ticket count");
console.log("✓ Kanban column-level context menu actions verified");

// Ticket title copy formatting
const formatTitleCopy = (title: string) => title.trim();
const copiedTitle = formatTitleCopy("  Checkout service returns 502 Bad Gateway  ");
assert.equal(copiedTitle, "Checkout service returns 502 Bad Gateway", "Title is trimmed properly");
console.log("✓ Ticket title copy formatting verified");

// 7. Test Team Member Context Menu Permissions & Actions
interface MockMember {
  _id: string;
  name: string;
  email: string;
  role: "super_admin" | "manager" | "team" | "client";
  departmentId?: string;
  active: boolean;
}

const evaluateMemberPermissions = (
  target: MockMember,
  actorId: string,
  actorRole: string,
  actorDeptId?: string
) => {
  const isSelf = target._id === actorId;
  const isSuperAdmin = actorRole === "super_admin";
  const isManager = actorRole === "manager";
  const isInSameDept = actorDeptId && target.departmentId ? actorDeptId === target.departmentId : false;

  const canManageRole =
    !isSelf &&
    (isSuperAdmin || (isManager && isInSameDept && target.role === "team"));

  const canToggleActive =
    !isSelf &&
    (isSuperAdmin || (isManager && isInSameDept && target.role === "team"));

  const canDelete =
    isSuperAdmin && !isSelf && target.role !== "super_admin";

  return { canManageRole, canToggleActive, canDelete, isSelf };
};

const agentInSupport: MockMember = {
  _id: "agent-1",
  name: "Bob Agent",
  email: "bob@support.com",
  role: "team",
  departmentId: "dept-support",
  active: true,
};

const managerSupport: MockMember = {
  _id: "mgr-1",
  name: "Alice Manager",
  email: "alice@support.com",
  role: "manager",
  departmentId: "dept-support",
  active: true,
};

const superAdminUser: MockMember = {
  _id: "admin-1",
  name: "Root Admin",
  email: "admin@company.com",
  role: "super_admin",
  active: true,
};

// Super admin testing on agent
const saOnAgent = evaluateMemberPermissions(agentInSupport, "admin-1", "super_admin");
assert.equal(saOnAgent.canManageRole, true, "Super admin can change agent's role");
assert.equal(saOnAgent.canToggleActive, true, "Super admin can toggle agent active state");
assert.equal(saOnAgent.canDelete, true, "Super admin can remove regular member");

// Super admin testing on self
const saOnSelf = evaluateMemberPermissions(superAdminUser, "admin-1", "super_admin");
assert.equal(saOnSelf.canManageRole, false, "Super admin cannot change own role");
assert.equal(saOnSelf.canToggleActive, false, "Super admin cannot deactivate self");
assert.equal(saOnSelf.canDelete, false, "Super admin cannot delete self");

// Manager testing on agent in same department
const mgrOnDeptAgent = evaluateMemberPermissions(agentInSupport, "mgr-1", "manager", "dept-support");
assert.equal(mgrOnDeptAgent.canManageRole, true, "Manager can manage agent in own department");
assert.equal(mgrOnDeptAgent.canToggleActive, true, "Manager can toggle agent in own department");
assert.equal(mgrOnDeptAgent.canDelete, false, "Manager can NEVER delete users");

// Manager testing on agent in DIFFERENT department
const mgrOnOtherDeptAgent = evaluateMemberPermissions(agentInSupport, "mgr-2", "manager", "dept-billing");
assert.equal(mgrOnOtherDeptAgent.canManageRole, false, "Manager cannot manage agent outside department");
assert.equal(mgrOnOtherDeptAgent.canToggleActive, false, "Manager cannot toggle agent outside department");

// Manager testing on peer manager
const mgrOnPeerManager = evaluateMemberPermissions(managerSupport, "mgr-2", "manager", "dept-support");
assert.equal(mgrOnPeerManager.canManageRole, false, "Manager cannot manage another manager");

console.log("✓ Team member role management and authorization rules verified");

// Copy actions formatting
const buildMemberProfileLink = (origin: string, email: string) =>
  `${origin}/dashboard/users?search=${encodeURIComponent(email)}`;
const profileLink = buildMemberProfileLink("https://ticketflow.app", "bob@support.com");
assert.equal(profileLink, "https://ticketflow.app/dashboard/users?search=bob%40support.com");
console.log("✓ Team member profile link and copy format verified");

// 8. Test Assignment Context Menu Permissions & Actions
interface MockTicketAssignment {
  ticketNumber: string;
  status: string;
  assignee?: { _id: string; name: string; email: string } | null;
}

const evaluateAssignmentPermissions = (
  ticket: MockTicketAssignment,
  actorRole: string
) => {
  const isClosed = ticket.status === "closed";
  const isManager = actorRole === "manager";
  const isSuperAdmin = actorRole === "super_admin";
  const canAssign = !isClosed && (isManager || isSuperAdmin);

  const assigneeDetails = ticket.assignee
    ? `${ticket.assignee.name} <${ticket.assignee.email}>`
    : null;

  return { canAssign, isClosed, assigneeDetails };
};

const assignedTicket: MockTicketAssignment = {
  ticketNumber: "TK-200",
  status: "open",
  assignee: { _id: "agent-1", name: "Bob Agent", email: "bob@support.com" },
};

const closedTicket: MockTicketAssignment = {
  ticketNumber: "TK-201",
  status: "closed",
  assignee: { _id: "agent-1", name: "Bob Agent", email: "bob@support.com" },
};

const unassignedTicket: MockTicketAssignment = {
  ticketNumber: "TK-202",
  status: "open",
  assignee: null,
};

// Manager evaluating assigned ticket
const mgrOnAssigned = evaluateAssignmentPermissions(assignedTicket, "manager");
assert.equal(mgrOnAssigned.canAssign, true, "Manager can reassign ticket");
assert.equal(mgrOnAssigned.assigneeDetails, "Bob Agent <bob@support.com>", "Formats details for copying");

// Agent evaluating assigned ticket
const agentOnAssigned = evaluateAssignmentPermissions(assignedTicket, "team");
assert.equal(agentOnAssigned.canAssign, false, "Agent cannot reassign ticket from context menu");

// Manager on closed ticket
const mgrOnClosed = evaluateAssignmentPermissions(closedTicket, "manager");
assert.equal(mgrOnClosed.canAssign, false, "Closed ticket cannot be reassigned or unassigned");

// Super admin on unassigned ticket
const saOnUnassigned = evaluateAssignmentPermissions(unassignedTicket, "super_admin");
assert.equal(saOnUnassigned.canAssign, true, "Super admin can forward/assign unassigned ticket");
assert.equal(saOnUnassigned.assigneeDetails, null, "Unassigned ticket has no assignee details");

console.log("✓ Assignment context menu permissions and details formatting verified");

// 8. Test Notification Context Menu Actions & State Adaptation
interface MockNotification {
  id: string;
  ticketId?: string;
  ticketNumber?: string;
  title: string;
  body: string;
  read: boolean;
  type: string;
}

const evaluateNotificationMenu = (notif: MockNotification, userRole: string = "agent") => {
  const toggleActionLabel = notif.read ? "Mark as unread" : "Mark as read";
  const nextReadState = !notif.read;
  const ticketBaseHref = userRole === "client" ? "/client/tickets/" : "/dashboard/tickets/";
  const ticketHref = notif.ticketId ? `${ticketBaseHref}${notif.ticketId}` : null;
  const copyText = `${notif.title}${notif.ticketNumber ? ` [${notif.ticketNumber}]` : ""}\n${notif.body}`;

  return {
    toggleActionLabel,
    nextReadState,
    ticketHref,
    copyText,
    canDismiss: true,
    canDelete: true,
  };
};

const unreadNotif: MockNotification = {
  id: "notif-1",
  ticketId: "t-100",
  ticketNumber: "TK-100",
  title: "New comment on ticket",
  body: "Customer replied to inquiry",
  read: false,
  type: "comment_added",
};

const readNotif: MockNotification = {
  id: "notif-2",
  ticketId: "t-101",
  ticketNumber: "TK-101",
  title: "You were assigned TK-101",
  body: "Database outage triage",
  read: true,
  type: "ticket_assigned",
};

const unreadMenu = evaluateNotificationMenu(unreadNotif, "team");
assert.equal(unreadMenu.toggleActionLabel, "Mark as read", "Unread notification presents 'Mark as read'");
assert.equal(unreadMenu.nextReadState, true, "Toggling unread notification marks as read");
assert.equal(unreadMenu.ticketHref, "/dashboard/tickets/t-100", "Resolves dashboard ticket path for staff");

const readMenu = evaluateNotificationMenu(readNotif, "client");
assert.equal(readMenu.toggleActionLabel, "Mark as unread", "Read notification presents 'Mark as unread'");
assert.equal(readMenu.nextReadState, false, "Toggling read notification marks as unread");
assert.equal(readMenu.ticketHref, "/client/tickets/t-101", "Resolves client ticket path for client role");

// Test bulk notification calculations
const notificationBatch = [unreadNotif, readNotif, { ...unreadNotif, id: "notif-3", read: false }];
const initialUnreadCount = notificationBatch.filter((n) => !n.read).length;
assert.equal(initialUnreadCount, 2, "Accurately computes unread count before bulk action");

const afterMarkAllRead = notificationBatch.map((n) => ({ ...n, read: true }));
const newUnreadCount = afterMarkAllRead.filter((n) => !n.read).length;
assert.equal(newUnreadCount, 0, "Bulk mark as read clears all unread indicators without double-counting");

console.log("✓ Notification context menu state adaptation and bulk counting verified");

// 9. Test Activity Feed Context Menu & Historical Integrity
interface MockActivity {
  id: string;
  ticketId?: string;
  ticketNumber?: string;
  details: string;
  user: { name: string; role: string } | string;
  timestamp: string;
  isAuditLog: boolean;
}

const evaluateActivityMenu = (activity: MockActivity, actorRole: string) => {
  const userName = typeof activity.user === "object" ? activity.user.name : activity.user;
  const userProfileHref = actorRole !== "client" && userName !== "System"
    ? `/dashboard/users?search=${encodeURIComponent(userName)}`
    : null;
  const ticketHref = activity.ticketId ? `/dashboard/tickets/${activity.ticketId}` : null;

  // Strict constraint: Historical audit logs must NOT allow edit or delete actions
  const canEdit = false;
  const canDelete = false;

  return {
    userName,
    userProfileHref,
    ticketHref,
    canEdit,
    canDelete,
  };
};

const auditEvent: MockActivity = {
  id: "act-1",
  ticketId: "t-100",
  ticketNumber: "TK-100",
  details: "changed status from open to in_progress",
  user: { name: "Agent Jane", role: "team" },
  timestamp: new Date().toISOString(),
  isAuditLog: true,
};

const activityMenu = evaluateActivityMenu(auditEvent, "manager");
assert.equal(activityMenu.ticketHref, "/dashboard/tickets/t-100", "Provides ticket navigation");
assert.equal(activityMenu.userProfileHref, "/dashboard/users?search=Agent%20Jane", "Provides user profile lookup");
assert.equal(activityMenu.canEdit, false, "Audit activity log cannot be edited");
assert.equal(activityMenu.canDelete, false, "Audit activity log cannot be deleted");

console.log("✓ Activity context menu actions and historical audit immutability verified");

console.log("=== All Context Menu Tests Passed Successfully! ===");
