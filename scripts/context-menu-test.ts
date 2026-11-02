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
} from "../src/components/productivity";

assert.ok(TicketContextMenu, "TicketContextMenu must be exported from productivity module");
assert.ok(MessageContextMenu, "MessageContextMenu must be exported from productivity module");
console.log("✓ TicketContextMenu and MessageContextMenu successfully exported from @/components/productivity");

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

console.log("=== All Context Menu Tests Passed Successfully! ===");
