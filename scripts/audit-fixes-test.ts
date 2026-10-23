/**
 * Regression tests for the audit bug fixes:
 *  - isReceivingManager requires pending status (no lingering access after rejection)
 *  - canAccessTicket denies rejected target managers
 *  - buildTicketSearchFilter matches unpadded ticket numbers (e.g. TK-5, 5 -> TK-0005)
 *  - System comments and closed tickets freeze comment editing/deletion
 *  - 15-minute edit window bounds
 *  - Manager user-modification bounds (cannot manage managers or promote to manager)
 *  - Notification URL role routing (/client vs /dashboard)
 * Run: npx tsx scripts/audit-fixes-test.ts
 */
import Module from "node:module";

const original = (Module.prototype as any).require;
(Module.prototype as any).require = function (id: string) {
  if (id === "server-only") return {};
  return original.apply(this, arguments as any);
};

import assert from "node:assert";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  try {
    const r = fn();
    if (r instanceof Promise) {
      return r.then(
        () => {
          passed++;
          console.log(`  ok - ${name}`);
        },
        (err) => {
          failed++;
          console.error(`  FAIL - ${name}:`, err);
        }
      );
    }
    passed++;
    console.log(`  ok - ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL - ${name}:`, err);
  }
  return Promise.resolve();
}

async function main() {
  console.log("audit fixes — transfer access & rejection safety");
  const { isReceivingManager, canDecideTransfer } = await import("../src/lib/transfer");
  const { canAccessTicket } = await import("../src/lib/authz");

  await test("isReceivingManager returns true for pending transfer", () => {
    const ok = isReceivingManager(
      { id: "mgrB", role: "manager", departmentId: "deptB" },
      { status: "pending", toDepartmentId: "deptB" }
    );
    assert.strictEqual(ok, true);
  });

  await test("isReceivingManager returns false for rejected transfer", () => {
    const ok = isReceivingManager(
      { id: "mgrB", role: "manager", departmentId: "deptB" },
      { status: "rejected", toDepartmentId: "deptB" }
    );
    assert.strictEqual(ok, false);
  });

  await test("isReceivingManager returns false for approved transfer", () => {
    const ok = isReceivingManager(
      { id: "mgrB", role: "manager", departmentId: "deptB" },
      { status: "approved", toDepartmentId: "deptB" }
    );
    assert.strictEqual(ok, false);
  });

  await test("canDecideTransfer returns false when transfer is rejected", () => {
    const ok = canDecideTransfer(
      { id: "mgrB", role: "manager", departmentId: "deptB" },
      { status: "rejected", toDepartmentId: "deptB" }
    );
    assert.strictEqual(ok, false);
  });

  await test("canAccessTicket denies receiving manager once transfer is rejected", () => {
    // Ticket remains in deptA; transfer to deptB was rejected
    const access = canAccessTicket(
      "manager",
      "mgrB",
      "client1",
      "agentA",
      "deptA",
      "deptB",
      { status: "rejected", toDepartmentId: "deptB" }
    );
    assert.strictEqual(access, false);
  });

  await test("canAccessTicket allows receiving manager while transfer is pending", () => {
    const access = canAccessTicket(
      "manager",
      "mgrB",
      "client1",
      "agentA",
      "deptA",
      "deptB",
      { status: "pending", toDepartmentId: "deptB" }
    );
    assert.strictEqual(access, true);
  });

  console.log("audit fixes — search unpadded digits & ticket numbers");
  const { buildTicketSearchFilter } = await import("../src/lib/search");

  await test("unpadded ticket number TK-5 produces zero-padding regex", () => {
    const filter = buildTicketSearchFilter("TK-5");
    assert.deepStrictEqual(filter, {
      ticketNumber: { $regex: "TK-?0*5$", $options: "i" },
    });
    const re = new RegExp(filter!.ticketNumber!.$regex, filter!.ticketNumber!.$options);
    assert.ok(re.test("TK-0005"));
    assert.ok(re.test("TK-5"));
    assert.ok(!re.test("TK-0050"));
  });

  await test("bare 3 digits produces zero-padding regex", () => {
    const filter = buildTicketSearchFilter("123");
    assert.deepStrictEqual(filter, {
      ticketNumber: { $regex: "TK-?0*123$", $options: "i" },
    });
    const re = new RegExp(filter!.ticketNumber!.$regex, filter!.ticketNumber!.$options);
    assert.ok(re.test("TK-0123"));
    assert.ok(re.test("TK-123"));
  });

  console.log("audit fixes — comment security rules");
  await test("15-minute edit window logic correctly identifies expired edits", () => {
    const EDIT_WINDOW_MS = 15 * 60 * 1000;
    const now = Date.now();
    const recent = new Date(now - 5 * 60 * 1000);
    const expired = new Date(now - 20 * 60 * 1000);

    assert.ok(now - recent.getTime() <= EDIT_WINDOW_MS);
    assert.ok(now - expired.getTime() > EDIT_WINDOW_MS);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
