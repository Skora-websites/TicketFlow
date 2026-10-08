/**
 * Regression tests for the inter-department transfer feature + dynamic categories.
 * Pure-logic suite (no DB): authz with transfers, priority lock, category utils.
 * Run: node_modules/.bin/tsx scripts/transfer-flow-test.ts
 */
import Module from "node:module";

// Stub server-only to a no-op before any project modules load (same trick as
// the other regression scripts).
const original = (Module.prototype as any).require;
(Module.prototype as any).require = function (id: string) {
  if (id === "server-only") return {};
  return original.apply(this, arguments as any);
};

import assert from "node:assert";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ok - ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL - ${name}:`, err);
  }
}

async function main() {
  const { canAccessTicket } = await import("../src/lib/authz");
  const { isReceivingManager, canDecideTransfer, isPriorityLockedFor, toTransferRef } = await import(
    "../src/lib/transfer"
  );
  const { slugifyCategory, DEFAULT_CATEGORY_SEEDS, LEGACY_CATEGORY_MAP } = await import(
    "../src/lib/categories"
  );

  // ---------- canAccessTicket with transfer context ----------
  console.log("canAccessTicket — inter-department transfer visibility");

  const pendingAgentTransfer = {
    status: "pending",
    fromId: "agentA",
    toDepartmentId: "deptB",
    toUserId: "agentB",
    toManagerId: "mgrB",
    direction: "agent",
  };

  test("receiving manager sees pending transfer addressed to their dept", () => {
    assert.ok(
      canAccessTicket("manager", "mgrB", "clientX", undefined, "deptA", "deptB", pendingAgentTransfer as any)
    );
  });
  test("unrelated manager does NOT see the pending transfer", () => {
    assert.ok(
      !canAccessTicket("manager", "mgrC", "clientX", undefined, "deptA", "deptC", pendingAgentTransfer as any)
    );
  });
  test("sender (team) still sees their sent ticket via requester/assignee rule", () => {
    // Sender visibility rides on the existing team rule (assignee or requester).
    assert.ok(canAccessTicket("team", "agentA", "agentA", undefined, "deptA", "deptA", pendingAgentTransfer as any));
  });
  test("target agent cannot see ticket before approval (not yet assigned)", () => {
    assert.ok(
      !canAccessTicket("team", "agentB", "clientX", undefined, "deptA", "deptB", pendingAgentTransfer as any)
    );
  });
  test("super_admin sees everything", () => {
    assert.ok(canAccessTicket("super_admin", "root", "clientX", undefined, "deptA", undefined, pendingAgentTransfer as any));
  });
  test("no transfer: old behavior preserved (cross-dept manager denied)", () => {
    assert.ok(!canAccessTicket("manager", "mgrB", "clientX", undefined, "deptA", "deptB", null));
  });

  // ---------- transfer decision rules ----------
  console.log("transfer decision + priority lock rules");

  test("receiving manager can decide a pending transfer", () => {
    assert.ok(
      canDecideTransfer({ id: "mgrB", role: "manager", departmentId: "deptB" }, pendingAgentTransfer as any)
    );
  });
  test("sending manager cannot decide someone else's incoming transfer", () => {
    assert.ok(
      !canDecideTransfer({ id: "mgrA", role: "manager", departmentId: "deptA" }, pendingAgentTransfer as any)
    );
  });
  test("cannot decide an already-approved transfer", () => {
    assert.ok(
      !canDecideTransfer(
        { id: "mgrB", role: "manager", departmentId: "deptB" },
        { ...pendingAgentTransfer, status: "approved" } as any
      )
    );
  });
  test("agents can never decide transfers", () => {
    assert.ok(!canDecideTransfer({ id: "agentB", role: "team", departmentId: "deptB" }, pendingAgentTransfer as any));
  });

  test("receiver cannot change sender-set priority (locked)", () => {
    assert.ok(isPriorityLockedFor({ id: "mgrB", role: "manager", departmentId: "deptB" }, pendingAgentTransfer as any));
    assert.ok(isPriorityLockedFor({ id: "agentB", role: "team", departmentId: "deptB" }, pendingAgentTransfer as any));
  });
  test("sender can still change their own priority", () => {
    assert.ok(!isPriorityLockedFor({ id: "agentA", role: "team", departmentId: "deptA" }, pendingAgentTransfer as any));
  });
  test("no transfer → priority never locked", () => {
    assert.ok(!isPriorityLockedFor({ id: "mgrB", role: "manager", departmentId: "deptB" }, null));
  });

  test("isReceivingManager matches explicit manager addressing", () => {
    assert.ok(
      isReceivingManager(
        { id: "mgrB", role: "manager", departmentId: undefined },
        { ...pendingAgentTransfer, toDepartmentId: "deptZ" } as any
      )
    );
  });

  test("toTransferRef normalizes ObjectIds to strings", () => {
    const ref = toTransferRef({
      status: "pending",
      fromId: { toString: () => "agentA" },
      toDepartmentId: { toString: () => "deptB" },
      toUserId: null,
      toManagerId: { toString: () => "mgrB" },
      direction: "agent",
    });
    assert.strictEqual(String(ref?.fromId), "agentA");
    assert.strictEqual(String(ref?.toDepartmentId), "deptB");
    assert.strictEqual(String(ref?.toManagerId), "mgrB");
    assert.strictEqual(ref?.status, "pending");
  });
  test("toTransferRef returns null for null/undefined", () => {
    assert.strictEqual(toTransferRef(null), null);
    assert.strictEqual(toTransferRef(undefined), null);
  });

  // ---------- dynamic categories ----------
  console.log("dynamic categories (Marketing / Development / Sales / Other + custom)");

  test("slugify basic names", () => {
    assert.strictEqual(slugifyCategory("Marketing"), "marketing");
    assert.strictEqual(slugifyCategory("Research & Development"), "research-and-development");
  });
  test("slugify handles symbols and spaces", () => {
    assert.strictEqual(slugifyCategory("  IT / Ops!  "), "it-ops");
    assert.strictEqual(slugifyCategory("R&D"), "r-and-d");
  });
  test("four default categories present", () => {
    assert.deepStrictEqual(
      DEFAULT_CATEGORY_SEEDS.map((c) => c.slug),
      ["marketing", "development", "sales", "other"]
    );
  });
  test("legacy categories map to new ones", () => {
    assert.strictEqual(LEGACY_CATEGORY_MAP["bug"], "development");
    assert.strictEqual(LEGACY_CATEGORY_MAP["feature"], "development");
    assert.strictEqual(LEGACY_CATEGORY_MAP["support"], "other");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
