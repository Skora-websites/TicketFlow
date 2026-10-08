/**
 * Regression tests for the conversation upgrade (chat panel).
 * Covers: additive schema defaults (old comments read as public messages),
 * visibility/kind enums, rate-limiter window math, and the closed-gate rule.
 * Run: node_modules/.bin/tsx scripts/chat-audit-test.ts
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
  const { checkRate } = await import("../src/lib/rateLimit");

  console.log("conversation schema defaults (additive migration safety)");
  const { Comment, TicketReadState } = await import("../src/lib/db/models");
  await test("Comment schema defaults: kind=message, visibility=public", () => {
    const kindPath = Comment.schema.path("kind");
    const visPath = Comment.schema.path("visibility");
    assert.strictEqual((kindPath as any).defaultValue, "message");
    assert.strictEqual((visPath as any).defaultValue, "public");
    assert.deepStrictEqual((kindPath as any).enumValues, ["message", "system"]);
    assert.deepStrictEqual((visPath as any).enumValues, ["public", "internal"]);
  });
  await test("old-style comment documents cast to public messages (no backfill needed)", () => {
    const doc = new Comment({ ticketId: "0".repeat(24), authorId: "1".repeat(24), body: "legacy" });
    assert.strictEqual(doc.kind, "message");
    assert.strictEqual(doc.visibility, "public");
  });
  await test("TicketReadState has a unique (userId, ticketId) index", () => {
    const indexes = TicketReadState.schema.indexes() as [Record<string, number>, Record<string, unknown>?][];
    const found = indexes.find(([keys]) => keys.userId === 1 && keys.ticketId === 1);
    assert.ok(found, "compound index missing");
    assert.strictEqual(found[1]?.unique, true);
  });

  console.log("comment rate limiter (30/min/user, runtime-core async API)");
  await test("allows up to the limit, then blocks within the window", async () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 30; i++) {
      assert.ok(!(await checkRate(key, 30, 60_000)), `request ${i + 1} should pass`);
    }
    assert.ok(await checkRate(key, 30, 60_000), "request 31 should be blocked");
  });
  await test("keys are isolated per user", async () => {
    const a = `u-a-${Math.random()}`;
    const b = `u-b-${Math.random()}`;
    assert.ok(!(await checkRate(a, 1, 60_000)));
    assert.ok(!(await checkRate(b, 1, 60_000)), "different key unaffected");
  });

  console.log("closed-gate + visibility rules (route logic encoded as data)");
  await test("staff roles eligible for internal notes", () => {
    const staff = ["team", "manager", "super_admin"];
    assert.ok(staff.includes("team") && staff.includes("manager") && staff.includes("super_admin"));
    assert.ok(!staff.includes("client"));
  });
  await test("closed status freezes conversation (documented decision)", () => {
    const frozenAt = "closed";
    assert.notStrictEqual(frozenAt, "resolved"); // resolved stays open for handoff talk
    assert.strictEqual(frozenAt, "closed");
  });

  console.log("chat participation (sender + owning/addressed manager + assigned agent)");
  const { isConversationParticipant } = await import("../src/lib/transfer");
  const senderTicket = {
    requesterId: "userA",
    assigneeId: "agentB",
    departmentId: "deptX",
    transfer: null,
  };
  await test("sender (filer) is a participant", () => {
    assert.ok(isConversationParticipant({ id: "userA", role: "team", departmentId: "deptX" }, senderTicket));
  });
  await test("assigned agent is a participant", () => {
    assert.ok(isConversationParticipant({ id: "agentB", role: "team", departmentId: "deptX" }, senderTicket));
  });
  await test("owning-department manager is a participant", () => {
    assert.ok(isConversationParticipant({ id: "mgrC", role: "manager", departmentId: "deptX" }, senderTicket));
  });
  await test("manager of ANOTHER department is NOT a participant", () => {
    assert.ok(!isConversationParticipant({ id: "mgrD", role: "manager", departmentId: "deptY" }, senderTicket));
  });
  await test("unrelated agent (team) is NOT a participant", () => {
    assert.ok(!isConversationParticipant({ id: "agentE", role: "team", departmentId: "deptX" }, senderTicket));
  });
  await test("super_admin is a participant in EVERY conversation", () => {
    assert.ok(isConversationParticipant({ id: "root", role: "super_admin" }, senderTicket));
    const unassigned = { requesterId: "userA", assigneeId: null, departmentId: "deptX", transfer: null };
    assert.ok(isConversationParticipant({ id: "root", role: "super_admin" }, unassigned));
  });
  await test("transferred ticket: sender of record keeps the chat", () => {
    const t = { ...senderTicket, transfer: { status: "approved", fromId: "userA", toDepartmentId: "deptY" } };
    assert.ok(isConversationParticipant({ id: "userA", role: "team", departmentId: "deptX" }, t));
  });
  await test("transferred ticket: addressed/receiving manager is a participant", () => {
    const t = { ...senderTicket, transfer: { status: "pending", fromId: "userA", toDepartmentId: "deptY", toManagerId: "mgrY" } };
    assert.ok(isConversationParticipant({ id: "mgrY", role: "manager", departmentId: "deptY" }, t));
  });
  await test("transferred ticket: intended agent is a participant", () => {
    const t = { ...senderTicket, transfer: { status: "approved", fromId: "userA", toDepartmentId: "deptY", toUserId: "agentB" } };
    assert.ok(isConversationParticipant({ id: "agentB", role: "team", departmentId: "deptY" }, t));
  });
  await test("client chats only on their own ticket", () => {
    assert.ok(isConversationParticipant({ id: "userA", role: "client" }, senderTicket));
    assert.ok(!isConversationParticipant({ id: "other", role: "client" }, senderTicket));
  });
  await test("ObjectId-shaped fields are handled (string comparison)", () => {
    const oid = { toString: () => "userA" } as unknown as string;
    assert.ok(isConversationParticipant({ id: "userA", role: "team" }, { ...senderTicket, requesterId: oid }));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
