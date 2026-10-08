/**
 * Regression tests for the runtime core (src/lib/runtime).
 * Covers: driver selection default, in-memory limiter window math + reset,
 * bus pub/sub semantics (sync subscribe, unsubscribe, listener-error
 * isolation), and presence TTL expiry — the contracts both drivers must keep.
 * Run: node_modules/.bin/tsx scripts/runtime-audit-test.ts
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const runtime = await import("../src/lib/runtime");
  const { checkRate, publishTicketEvent, subscribeTicket, touchPresence, listPresence } = runtime;

  console.log("runtime core — driver selection");
  await test("default driver is in-memory (no RUNTIME_DRIVER configured)", () => {
    assert.strictEqual(runtime.getRuntimeDriverName(), "memory");
  });
  await test("facade exports match the two legacy module surfaces plus presence", () => {
    for (const fn of ["checkRate", "publishTicketEvent", "subscribeTicket", "touchPresence", "listPresence"]) {
      assert.strictEqual(typeof (runtime as Record<string, unknown>)[fn], "function", `${fn} missing`);
    }
  });

  console.log("rate limiter (fixed window, async contract)");
  await test("allows up to the limit, then blocks", async () => {
    const key = `rt-test-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      assert.ok(!(await checkRate(key, 5, 60_000)), `request ${i + 1} should pass`);
    }
    assert.ok(await checkRate(key, 5, 60_000), "request 6 should be blocked");
  });
  await test("window reset lets requests through again", async () => {
    const key = `rt-reset-${Math.random()}`;
    assert.ok(!(await checkRate(key, 1, 25))); // 1/25ms
    assert.ok(await checkRate(key, 1, 25)); // blocked inside window
    await sleep(40); // window elapsed
    assert.ok(!(await checkRate(key, 1, 25)), "should pass after window reset");
  });
  await test("keys are isolated", async () => {
    const a = `rt-a-${Math.random()}`;
    const b = `rt-b-${Math.random()}`;
    assert.ok(!(await checkRate(a, 1, 60_000)));
    assert.ok(!(await checkRate(b, 1, 60_000)), "different key unaffected");
  });

  console.log("event bus (sync subscribe, fire-and-forget publish)");
  await test("publish reaches subscribers with type + timestamp", async () => {
    const ticket = `rt-bus-${Math.random()}`;
    const seen: unknown[] = [];
    const unsubscribe = subscribeTicket(ticket, (e) => seen.push(e));
    publishTicketEvent(ticket, "comment");
    await sleep(10); // memory driver is sync; give the microtask queue a beat anyway
    assert.strictEqual(seen.length, 1);
    assert.strictEqual((seen[0] as { type: string }).type, "comment");
    assert.strictEqual(typeof (seen[0] as { at: string }).at, "string");
    unsubscribe();
  });
  await test("unsubscribe stops delivery", async () => {
    const ticket = `rt-bus2-${Math.random()}`;
    let count = 0;
    const unsubscribe = subscribeTicket(ticket, () => count++);
    publishTicketEvent(ticket, "comment");
    unsubscribe();
    publishTicketEvent(ticket, "comment");
    assert.strictEqual(count, 1, "no delivery after unsubscribe");
  });
  await test("a throwing listener does not break other listeners or the publisher", () => {
    const ticket = `rt-bus3-${Math.random()}`;
    let good = 0;
    const unsubscribe1 = subscribeTicket(ticket, () => {
      throw new Error("broken stream");
    });
    const unsubscribe2 = subscribeTicket(ticket, () => good++);
    assert.doesNotThrow(() => publishTicketEvent(ticket, "ticket"));
    assert.strictEqual(good, 1);
    unsubscribe1();
    unsubscribe2();
  });
  await test("publish to a ticket with no subscribers is a no-op", () => {
    assert.doesNotThrow(() => publishTicketEvent(`rt-empty-${Math.random()}`, "read"));
  });

  console.log("presence (per-entry TTL)");
  await test("touch then list returns members newest-first", async () => {
    const zone = `rt-zone-${Math.random()}`;
    await touchPresence(zone, "alice", 60_000);
    await sleep(5);
    await touchPresence(zone, "bob", 60_000);
    const members = await listPresence(zone);
    assert.deepStrictEqual(
      members.map((m) => m.id),
      ["bob", "alice"]
    );
    assert.strictEqual(typeof members[0].lastSeenAt, "number");
  });
  await test("expired entries disappear", async () => {
    const zone = `rt-ttl-${Math.random()}`;
    await touchPresence(zone, "ghost", 15);
    await sleep(30);
    const members = await listPresence(zone);
    assert.strictEqual(members.length, 0, "expired member should be pruned");
  });
  await test("refreshing a touch extends presence", async () => {
    const zone = `rt-refresh-${Math.random()}`;
    await touchPresence(zone, "carol", 20);
    await sleep(10);
    await touchPresence(zone, "carol", 60_000); // refresh before expiry
    await sleep(20);
    const members = await listPresence(zone);
    assert.deepStrictEqual(members.map((m) => m.id), ["carol"]);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
