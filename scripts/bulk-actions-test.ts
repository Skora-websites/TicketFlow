/**
 * DB-backed regression tests for the shared ticket mutation pipeline
 * (`applyTicketPatch`) — the single implementation behind BOTH
 * `PATCH /api/tickets/[id]` and `POST /api/tickets/bulk`.
 *
 * Proves the property the bulk feature depends on: a batch action cannot take
 * a permission path the single-ticket route would reject, and Undo restores
 * only the fields that actually changed.
 *
 * Run: npx tsx scripts/bulk-actions-test.ts
 */
import Module from "node:module";
import assert from "node:assert";

// Stub server-only before any project module loads (same trick as the other
// regression scripts).
const original = (Module.prototype as any).require;
(Module.prototype as any).require = function (id: string) {
  if (id === "server-only") return {};
  return original.apply(this, arguments as any);
};

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  ok - ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL - ${name}:`, err);
  }
}

async function main() {
  const { MongoMemoryServer } = await import("mongodb-memory-server");
  const mongoose = (await import("mongoose")).default;

  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri("ticketflow_bulk_test");

  const { connectDB } = await import("../src/lib/db/mongo");
  await connectDB();

  const { applyTicketPatch } = await import("../src/lib/ticketPatch");
  const { Department, User, Ticket, Comment, Notification } = await import(
    "../src/lib/db/models"
  );

  const deptA = await Department.create({ name: "Alpha", color: "#111111" });
  const deptB = await Department.create({ name: "Beta", color: "#222222" });

  const managerA = await User.create({
    name: "Mia Manager",
    email: "mia@example.com",
    passwordHash: "x",
    role: "manager",
    departmentId: deptA._id,
  });
  const agentA = await User.create({
    name: "Ann Agent",
    email: "ann@example.com",
    passwordHash: "x",
    role: "team",
    departmentId: deptA._id,
  });
  const agentA2 = await User.create({
    name: "Abe Agent",
    email: "abe@example.com",
    passwordHash: "x",
    role: "team",
    departmentId: deptA._id,
  });
  const managerB = await User.create({
    name: "Bob Boss",
    email: "bob@example.com",
    passwordHash: "x",
    role: "manager",
    departmentId: deptB._id,
  });
  const superAdmin = await User.create({
    name: "Root",
    email: "root@example.com",
    passwordHash: "x",
    role: "super_admin",
  });
  const client = await User.create({
    name: "Cara Client",
    email: "cara@example.com",
    passwordHash: "x",
    role: "client",
  });

  const actor = (doc: any) => ({
    id: doc._id.toString(),
    role: doc.role,
    name: doc.name,
    email: doc.email,
    departmentId: doc.departmentId?.toString(),
    ticketAccess: doc.ticketAccess,
  });

  let seq = 1;
  const mkTicket = (over: Record<string, unknown> = {}) =>
    Ticket.create({
      ticketNumber: `TK-${String(seq++).padStart(4, "0")}`,
      title: "Printer on fire",
      description: "It is genuinely on fire",
      category: "other",
      priority: "medium",
      status: "open",
      requesterId: client._id,
      departmentId: deptA._id,
      assigneeId: agentA._id,
      ...over,
    });

  // ── manager assignment ────────────────────────────────────────────
  console.log("manager assignment (bulk-equivalent per-ticket calls)");
  const bulkA = await mkTicket();
  const bulkB = await mkTicket({ status: "in_progress" });
  for (const t of [bulkA, bulkB]) {
    const res = await applyTicketPatch(actor(managerA), t._id.toString(), {
      assigneeId: agentA2._id.toString(),
    });
    assert.strictEqual(res.ok, true, "manager should assign within department");
  }
  const reassigned = await Ticket.findById(bulkA._id).lean();
  assert.strictEqual(reassigned?.assigneeId?.toString(), agentA2._id.toString());

  await test("assignment records the previous assignee for undo", async () => {
    const t = await mkTicket();
    const res = await applyTicketPatch(actor(managerA), t._id.toString(), {
      assigneeId: agentA2._id.toString(),
    });
    assert.ok(res.ok);
    if (!res.ok) return;
    assert.deepStrictEqual(res.changed, ["assigneeId"]);
    assert.strictEqual(res.previous.assigneeId, agentA._id.toString());
  });

  await test("assignment writes a system timeline entry", async () => {
    const t = await mkTicket();
    await applyTicketPatch(actor(managerA), t._id.toString(), {
      assigneeId: agentA2._id.toString(),
    });
    const events = await Comment.find({ ticketId: t._id, kind: "system" }).lean();
    assert.ok(events.length >= 1, "expected a system comment");
    assert.match(events[0].body, /assigned this ticket to Abe Agent/);
  });

  await test("manager cannot assign outside their department", async () => {
    const t = await mkTicket();
    const res = await applyTicketPatch(actor(managerA), t._id.toString(), {
      assigneeId: managerB._id.toString(),
    });
    assert.strictEqual(res.ok, false);
    if (!res.ok) {
      assert.strictEqual(res.status, 403);
      assert.match(res.error, /own department/);
    }
  });

  await test("super admin cannot assign to a non-manager", async () => {
    const t = await mkTicket();
    const res = await applyTicketPatch(actor(superAdmin), t._id.toString(), {
      assigneeId: agentA2._id.toString(),
    });
    assert.strictEqual(res.ok, false);
    if (!res.ok) assert.strictEqual(res.status, 403);
  });

  await test("super admin forward moves the ticket into the manager's department", async () => {
    const orphan = await mkTicket({ assigneeId: undefined, departmentId: undefined });
    const res = await applyTicketPatch(actor(superAdmin), orphan._id.toString(), {
      assigneeId: managerB._id.toString(),
    });
    assert.strictEqual(res.ok, true);
    const after = await Ticket.findById(orphan._id).lean();
    assert.strictEqual(after?.departmentId?.toString(), deptB._id.toString());
  });

  // ── status rules ──────────────────────────────────────────────────
  console.log("status transitions and bulk partial results");
  await test("manager can close tickets and undo restores the original status", async () => {
    const t = await mkTicket({ status: "in_progress" });
    const closed = await applyTicketPatch(actor(managerA), t._id.toString(), { status: "closed" });
    assert.ok(closed.ok);
    if (!closed.ok) return;
    assert.deepStrictEqual(closed.changed, ["status"]);
    assert.strictEqual(closed.previous.status, "in_progress");

    const undo = await applyTicketPatch(actor(managerA), t._id.toString(), {
      status: closed.previous.status as "in_progress",
    });
    assert.ok(undo.ok);
    const after = await Ticket.findById(t._id).lean();
    assert.strictEqual(after?.status, "in_progress");
    assert.strictEqual(after?.closedAt, null);
  });

  await test("bulk loop applies what it may and reports the forbidden ticket", async () => {
    const mine = await mkTicket();
    const foreign = await mkTicket({ departmentId: deptB._id, assigneeId: managerB._id });
    const results: { ok: boolean; status?: number }[] = [];
    for (const id of [mine._id.toString(), foreign._id.toString()]) {
      const res = await applyTicketPatch(actor(managerA), id, { status: "closed" });
      results.push(res.ok ? { ok: true } : { ok: false, status: res.status });
    }
    assert.deepStrictEqual(results, [{ ok: true }, { ok: false, status: 403 }]);
  });

  await test("assignee agent may advance status", async () => {
    const t = await mkTicket({ assigneeId: agentA._id });
    const res = await applyTicketPatch(actor(agentA), t._id.toString(), { status: "in_progress" });
    assert.ok(res.ok);
  });

  await test("non-assignee agent in the same department cannot change status", async () => {
    const t = await mkTicket({ assigneeId: agentA._id });
    const res = await applyTicketPatch(actor(agentA2), t._id.toString(), { status: "in_progress" });
    assert.strictEqual(res.ok, false);
    if (!res.ok) {
      assert.strictEqual(res.status, 403);
      assert.match(res.error, /Cannot transition status/);
    }
  });

  await test("invalid transition is rejected (closed → resolved)", async () => {
    const t = await mkTicket({ status: "closed", assigneeId: agentA._id });
    const res = await applyTicketPatch(actor(agentA), t._id.toString(), { status: "resolved" });
    assert.strictEqual(res.ok, false);
    if (!res.ok) assert.strictEqual(res.status, 403);
  });

  await test("re-closing an already closed ticket is a no-op with nothing to undo", async () => {
    const t = await mkTicket({ status: "closed" });
    const res = await applyTicketPatch(actor(managerA), t._id.toString(), { status: "closed" });
    assert.ok(res.ok);
    if (res.ok) assert.deepStrictEqual(res.changed, []);
  });

  // ── field-level rules ─────────────────────────────────────────────
  console.log("field rules (client allowlist, priority lock, IDOR)");
  await test("client may reopen their own resolved ticket", async () => {
    const t = await mkTicket({ status: "resolved", assigneeId: undefined });
    const res = await applyTicketPatch(actor(client), t._id.toString(), { status: "open" });
    assert.ok(res.ok);
  });

  await test("client cannot touch any field except status", async () => {
    const t = await mkTicket({ status: "resolved", assigneeId: undefined });
    const res = await applyTicketPatch(actor(client), t._id.toString(), { priority: "high" });
    assert.strictEqual(res.ok, false);
    if (!res.ok) {
      assert.strictEqual(res.status, 403);
      assert.match(res.error, /Clients may only update ticket status/);
    }
  });

  await test("priority is read-only for managers (sender of record only)", async () => {
    const t = await mkTicket();
    const res = await applyTicketPatch(actor(managerA), t._id.toString(), { priority: "urgent" });
    assert.strictEqual(res.ok, false);
    if (!res.ok) {
      assert.strictEqual(res.status, 403);
      assert.match(res.error, /Only the sender/);
    }
  });

  await test("staff filer can set priority; previous value is returned for undo", async () => {
    // Priority belongs to the sender of record. A CLIENT cannot use it at all
    // (clients may only update status), so the filer must be a staff member.
    const t = await mkTicket({ requesterId: agentA._id, assigneeId: agentA2._id });
    const res = await applyTicketPatch(actor(agentA), t._id.toString(), { priority: "urgent" });
    assert.ok(res.ok);
    if (!res.ok) return;
    assert.deepStrictEqual(res.changed, ["priority"]);
    assert.strictEqual(res.previous.priority, "medium");

    const undo = await applyTicketPatch(actor(agentA), t._id.toString(), {
      priority: res.previous.priority as "medium",
    });
    assert.ok(undo.ok);
    const after = await Ticket.findById(t._id).lean();
    assert.strictEqual(after?.priority, "medium");
  });

  await test("manager of another department is denied entirely (IDOR)", async () => {
    const t = await mkTicket();
    const res = await applyTicketPatch(actor(managerB), t._id.toString(), { status: "closed" });
    assert.strictEqual(res.ok, false);
    if (!res.ok) {
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.error, "Forbidden");
    }
  });

  await test("invalid id is a 400, missing ticket is a 404", async () => {
    const bad = await applyTicketPatch(actor(managerA), "not-an-id", { status: "closed" });
    assert.strictEqual(bad.ok, false);
    if (!bad.ok) assert.strictEqual(bad.status, 400);

    const missing = await applyTicketPatch(
      actor(managerA),
      new mongoose.Types.ObjectId().toString(),
      { status: "closed" }
    );
    assert.strictEqual(missing.ok, false);
    if (!missing.ok) assert.strictEqual(missing.status, 404);
  });

  // ── side effects ──────────────────────────────────────────────────
  console.log("side effects");
  await test("status change notifies the requester", async () => {
    const t = await mkTicket();
    await applyTicketPatch(actor(managerA), t._id.toString(), { status: "closed" });
    const notes = await Notification.find({ ticketId: t._id, type: "status_changed" }).lean();
    assert.ok(notes.length >= 1, "expected a status_changed notification");
    assert.ok(notes.some((n) => n.userId.toString() === client._id.toString()));
  });

  await test("assignment notifies the new assignee", async () => {
    const t = await mkTicket();
    await applyTicketPatch(actor(managerA), t._id.toString(), {
      assigneeId: agentA2._id.toString(),
    });
    const notes = await Notification.find({ ticketId: t._id, type: "ticket_assigned" }).lean();
    assert.ok(notes.some((n) => n.userId.toString() === agentA2._id.toString()));
  });

  console.log(`\n${passed} passed, ${failed} failed`);

  await mongoose.disconnect();
  await mongod.stop();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
