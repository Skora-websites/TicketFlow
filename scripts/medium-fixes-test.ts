/**
 * Regression tests for the medium-severity fixes (visibility + performance).
 * Run: node_modules/.bin/tsx scripts/medium-fixes-test.ts
 */
import Module from "node:module";

// Stub server-only to a no-op before any project modules load (same trick as
// the seed script — these guards only apply inside Next).
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

  console.log("canAccessTicket — team role sees own-requested tickets");
  test("team assigned to ticket", () => {
    assert.ok(canAccessTicket("team", "u1", "u2", "u1", "d1", "d1"));
  });
  test("team requested the ticket themselves (no assignee)", () => {
    assert.ok(canAccessTicket("team", "u1", "u1", undefined, "d1", "d1"));
  });
  test("team requested the ticket (assigned to someone else)", () => {
    assert.ok(canAccessTicket("team", "u1", "u1", "u2", "d1", "d1"));
  });
  test("team (assigned-scope) still cannot see unrelated ticket", () => {
    assert.ok(!canAccessTicket("team", "u1", "u2", "u3", "d1", "d1", undefined, "assigned"));
  });
  test("team (assigned-scope) cannot see unassigned ticket they didn't file", () => {
    assert.ok(!canAccessTicket("team", "u1", "u2", undefined, "d1", "d1", undefined, "assigned"));
  });
  test("team (department-scope, new default) sees dept ticket they didn't file", () => {
    assert.ok(canAccessTicket("team", "u1", "u2", undefined, "d1", "d1"));
  });
  test("client unchanged: own ticket", () => {
    assert.ok(canAccessTicket("client", "u1", "u1", undefined, undefined, undefined));
  });
  test("client unchanged: other's ticket denied", () => {
    assert.ok(!canAccessTicket("client", "u1", "u2", undefined, undefined, undefined));
  });
  test("manager dept match unchanged", () => {
    assert.ok(canAccessTicket("manager", "u1", "u2", undefined, "d1", "d1"));
  });
  test("dept-less manager unchanged (assigned only)", () => {
    assert.ok(canAccessTicket("manager", "u1", "u2", "u1", undefined, undefined));
  });
  test("super_admin unchanged", () => {
    assert.ok(canAccessTicket("super_admin", "u1", "u2", undefined, "d9", undefined));
  });

  const { buildTicketSearchFilter } = await import("../src/lib/search");

  console.log("buildTicketSearchFilter — $text clause + ticket-number branch");
  test("plain words become a $text query", () => {
    assert.deepStrictEqual(buildTicketSearchFilter("login issue"), {
      $text: { $search: "login issue" },
    });
  });
  test("null/empty/whitespace produce no clause", () => {
    assert.strictEqual(buildTicketSearchFilter(undefined), null);
    assert.strictEqual(buildTicketSearchFilter(42), null);
    assert.strictEqual(buildTicketSearchFilter("   "), null);
  });
  test("quotes and backslashes are stripped (no phrase/inversion surprises)", () => {
    assert.deepStrictEqual(buildTicketSearchFilter('"dark" \\ mode'), {
      $text: { $search: "dark mode" },
    });
  });
  test("leading hyphens are neutralized (no accidental term negation)", () => {
    assert.deepStrictEqual(buildTicketSearchFilter("dark -mode"), {
      $text: { $search: "dark mode" },
    });
  });
  test("query length is capped", () => {
    const clause = buildTicketSearchFilter("a".repeat(500));
    assert.strictEqual(clause?.$text?.$search?.length, 100);
  });
  test("exact ticket number becomes a pure lookup (no $text — it would dead-match)", () => {
    assert.deepStrictEqual(buildTicketSearchFilter("TK-1024"), {
      ticketNumber: { $regex: "TK-?1024$", $options: "i" },
    });
  });
  test("bare digits also become a pure lookup (3-6 digits)", () => {
    assert.deepStrictEqual(buildTicketSearchFilter("1024"), {
      ticketNumber: { $regex: "TK-?1024$", $options: "i" },
    });
  });
  test("mixed number + words searches text tokens (AND number would only narrow)", () => {
    assert.deepStrictEqual(buildTicketSearchFilter("TK-1024 broken"), {
      $text: { $search: "TK-1024 broken" },
    });
  });
  test("7+ digit runs are normal text, not ticket numbers", () => {
    const clause = buildTicketSearchFilter("1234567890");
    assert.strictEqual(clause?.ticketNumber, undefined);
    assert.strictEqual(typeof clause?.$text?.$search, "string");
  });
  test("only-negation input degrades to no clause, not an empty $search", () => {
    assert.strictEqual(buildTicketSearchFilter("- -"), null);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
