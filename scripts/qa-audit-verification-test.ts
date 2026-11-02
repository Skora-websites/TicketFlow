import Module from "node:module";

// Stub server-only to a no-op before any project modules load
const original = (Module.prototype as any).require;
(Module.prototype as any).require = function (id: string) {
  if (id === "server-only") return {};
  return original.apply(this, arguments as any);
};

import assert from "node:assert";
import type { BaseDraft } from "../src/lib/drafts/types";

// Setup storage mock for client-side storage tests
const store = new Map<string, string>();
(globalThis as any).window = {
  localStorage: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, val: string) => store.set(key, val),
    removeItem: (key: string) => store.delete(key),
    get length() {
      return store.size;
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
  },
};

async function main() {
  const { buildTicketSearchFilter } = await import("../src/lib/search");
  const {
    saveDraftToStorage,
    loadDraftFromStorage,
    loadAllDraftsFromStorage,
    clearAllDraftsFromStorage,
  } = await import("../src/lib/drafts/storage");
  const { canAccessTicket, canTransitionStatus } = await import("../src/lib/authz");
  const { canDecideTransfer, canSetPriority } = await import("../src/lib/transfer");

  console.log("=== End-to-End QA Audit Verification Test Suite ===");

// -----------------------------------------------------------------------------
// Test 1: Ticket Search Prefix & Number Matching
// -----------------------------------------------------------------------------
{
  console.log("\n1. Ticket Search Prefix & Precision Tests");
  const prefixTk = buildTicketSearchFilter("TK");
  assert.ok(prefixTk?.ticketNumber, "Prefix 'TK' produces ticketNumber regex");
  assert.strictEqual(prefixTk.ticketNumber.$regex, "^TK-");

  const prefixTkHyphen = buildTicketSearchFilter("TK-");
  assert.ok(prefixTkHyphen?.ticketNumber, "Prefix 'TK-' produces ticketNumber regex");
  assert.strictEqual(prefixTkHyphen.ticketNumber.$regex, "^TK-");

  const exactTicket = buildTicketSearchFilter("TK-0042");
  assert.ok(exactTicket?.ticketNumber, "Exact 'TK-0042' matches ticketNumber regex");
  assert.ok(new RegExp(exactTicket.ticketNumber.$regex, "i").test("TK-0042"), "Matches TK-0042");
  assert.ok(new RegExp(exactTicket.ticketNumber.$regex, "i").test("TK0042"), "Matches TK0042");

  const bareNum = buildTicketSearchFilter("1024");
  assert.ok(bareNum?.ticketNumber, "Bare digits '1024' produce ticketNumber lookup");

  const textSearch = buildTicketSearchFilter("Database connection drops");
  assert.ok(textSearch?.$text, "General text queries use MongoDB $text index");

  console.log("  ✓ Search prefix 'TK', exact ticket numbers, and text queries verified");
}

// -----------------------------------------------------------------------------
// Test 2: Draft Dock Multi-User Isolation & Session Leak Prevention
// -----------------------------------------------------------------------------
{
  console.log("\n2. Draft Dock User Isolation Tests");
  store.clear();

  const user1Draft: BaseDraft = {
    id: "ticket:user1",
    type: "ticket",
    title: "User 1 Secret Ticket",
    path: "/dashboard/tickets/new",
    data: { title: "Classified Security Bug" },
    isMinimized: true,
    updatedAt: Date.now(),
    userId: "usr_agent_001",
  };

  const user2Draft: BaseDraft = {
    id: "ticket:user2",
    type: "ticket",
    title: "User 2 Public Ticket",
    path: "/client/tickets/new",
    data: { title: "Printer Issue" },
    isMinimized: true,
    updatedAt: Date.now(),
    userId: "usr_client_002",
  };

  saveDraftToStorage(user1Draft);
  saveDraftToStorage(user2Draft);

  // When Agent usr_agent_001 queries drafts, they must not see usr_client_002's drafts
  const agentDrafts = loadAllDraftsFromStorage("usr_agent_001");
  assert.strictEqual(agentDrafts.length, 1, "Agent sees exactly 1 draft");
  assert.strictEqual(agentDrafts[0].id, "ticket:user1");

  // When Client usr_client_002 queries drafts, they must NOT see Agent's drafts
  const clientDrafts = loadAllDraftsFromStorage("usr_client_002");
  assert.strictEqual(clientDrafts.length, 1, "Client sees only their own draft");
  assert.strictEqual(clientDrafts[0].id, "ticket:user2");

  // Clear drafts for specific user
  clearAllDraftsFromStorage("usr_client_002");
  assert.strictEqual(loadAllDraftsFromStorage("usr_client_002").length, 0, "Client drafts cleared");
  assert.strictEqual(loadAllDraftsFromStorage("usr_agent_001").length, 1, "Agent drafts intact after client clear");

  console.log("  ✓ Drafts strictly isolated per user; cross-account session leakage prevented");
}

// -----------------------------------------------------------------------------
// Test 3: Comment Moderation & Closed Ticket Guards
// -----------------------------------------------------------------------------
{
  console.log("\n3. Comment Moderation & Status Transition Rules");

  // Verify status transitions
  assert.strictEqual(canTransitionStatus("manager", "open", "in_progress", false, false), true, "Manager can move status");
  assert.strictEqual(canTransitionStatus("manager", "resolved", "closed", false, false), true, "Manager can close ticket");
  assert.strictEqual(canTransitionStatus("team", "open", "in_progress", false, true), true, "Assigned agent can move status");
  assert.strictEqual(canTransitionStatus("team", "open", "in_progress", false, false), false, "Non-assigned agent cannot move status");
  assert.strictEqual(canTransitionStatus("client", "closed", "open", true, false), true, "Client can reopen closed ticket");
  assert.strictEqual(canTransitionStatus("client", "open", "closed", true, false), false, "Client cannot close or jump states");

  console.log("  ✓ Status transition permission matrix verified");
}

// -----------------------------------------------------------------------------
// Test 4: Transfer Flow Access, Decision & Priority Retention
// -----------------------------------------------------------------------------
{
  console.log("\n4. Inter-Department Transfer Integrity Tests");

  const deptA = "dept_development";
  const deptB = "dept_finance";
  const receivingMgr = { id: "mgr_finance_1", role: "manager", departmentId: deptB };
  const sendingMgr = { id: "mgr_dev_1", role: "manager", departmentId: deptA };
  const randomAgent = { id: "agent_dev_1", role: "team", departmentId: deptA };

  const pendingTransfer = {
    status: "pending",
    fromId: sendingMgr.id,
    toDepartmentId: deptB,
    toManagerId: receivingMgr.id,
    direction: "manager",
  };

  // Only receiving manager can decide
  assert.strictEqual(canDecideTransfer(receivingMgr, pendingTransfer), true, "Receiving manager can decide pending transfer");
  assert.strictEqual(canDecideTransfer(sendingMgr, pendingTransfer), false, "Sending manager cannot decide transfer");
  assert.strictEqual(canDecideTransfer(randomAgent, pendingTransfer), false, "Agents cannot decide transfer");

  // Once decided, cannot be re-decided
  const approvedTransfer = { ...pendingTransfer, status: "approved" };
  assert.strictEqual(canDecideTransfer(receivingMgr, approvedTransfer), false, "Approved transfer cannot be re-decided");

  const rejectedTransfer = { ...pendingTransfer, status: "rejected" };
  assert.strictEqual(canDecideTransfer(receivingMgr, rejectedTransfer), false, "Rejected transfer cannot be re-decided");

  // Priority is locked to the original sender
  const ticketWithTransfer = { requesterId: "client_1", transfer: pendingTransfer };
  assert.strictEqual(canSetPriority(sendingMgr, ticketWithTransfer), true, "Transfer sender retains priority write access");
  assert.strictEqual(canSetPriority(receivingMgr, ticketWithTransfer), false, "Receiving manager CANNOT change sender-set priority");
  assert.strictEqual(canSetPriority(randomAgent, ticketWithTransfer), false, "Other agents cannot alter transferred priority");

  console.log("  ✓ Transfer decision permissions, one-time lifecycle, and priority lock verified");
}

// -----------------------------------------------------------------------------
// Test 5: Client Portal Critical Data Isolation
// -----------------------------------------------------------------------------
{
  console.log("\n5. Client Data Isolation & Boundary Tests");

  const clientUserId = "client_sarah";
  const otherClientUserId = "client_bob";
  const teamAgentId = "agent_alex";
  const devDeptId = "dept_dev";

  // Own ticket vs other client's ticket
  assert.strictEqual(canAccessTicket("client", clientUserId, clientUserId), true, "Client can access own ticket");
  assert.strictEqual(canAccessTicket("client", clientUserId, otherClientUserId), false, "Client CANNOT access another client's ticket");

  // Team scope: assigned vs department
  assert.strictEqual(
    canAccessTicket("team", teamAgentId, clientUserId, teamAgentId, devDeptId, devDeptId, null, "assigned"),
    true,
    "Agent can access assigned ticket with assigned-scope"
  );
  assert.strictEqual(
    canAccessTicket("team", teamAgentId, clientUserId, "other_agent", devDeptId, devDeptId, null, "assigned"),
    false,
    "Agent CANNOT access unassigned/other-agent ticket with assigned-scope"
  );
  assert.strictEqual(
    canAccessTicket("team", teamAgentId, clientUserId, "other_agent", devDeptId, devDeptId, null, "department"),
    true,
    "Agent with department-scope can view department tickets"
  );

  console.log("  ✓ Client isolation and agent ticket access scopes strictly enforced");
}

  console.log("\n=== ALL QA AUDIT VERIFICATIONS PASSED SUCCESSFULLY ===");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
