/**
 * Security regression tests for the authz/file-validation fixes.
 * Run: npx tsx scripts/authz-audit-test.ts
 */
import Module from "node:module";

// Stub server-only to a no-op before any project modules load (these guards
// only apply inside Next; same trick as the seed script).
const original = (Module.prototype as any).require;
(Module.prototype as any).require = function (id: string) {
  if (id === "server-only") return {};
  return original.apply(this, arguments as any);
};

import assert from "node:assert";

async function main() {
const { canAccessTicket, sanitizeSearch, escapeRegExp } = await import("../src/lib/authz");
const { attachmentMimeAllowed } = await import("../src/lib/fileValidation");

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

console.log("canAccessTicket matrix");

const T = "ticket1";
test("client can access own ticket", () => {
  assert.ok(canAccessTicket("client", "u1", "u1", undefined, undefined, undefined));
});
test("client cannot access another user's ticket", () => {
  assert.ok(!canAccessTicket("client", "u1", "u2", undefined, undefined, undefined));
});
test("team can access assigned ticket", () => {
  assert.ok(canAccessTicket("team", "u1", "u2", "u1", "d1", "d1"));
});
test("team with default (department) access sees same-dept ticket", () => {
  assert.ok(canAccessTicket("team", "u1", "u2", undefined, "d1", "d1"));
});
test("team with 'assigned' access cannot see unassigned dept ticket", () => {
  assert.ok(!canAccessTicket("team", "u1", "u2", undefined, "d1", "d1", undefined, "assigned"));
});
test("team with 'assigned' access still sees own filed ticket", () => {
  assert.ok(canAccessTicket("team", "u1", "u1", undefined, "d1", "d1", undefined, "assigned"));
});
test("team with 'assigned' access cannot see other dept tickets", () => {
  assert.ok(!canAccessTicket("team", "u1", "u2", undefined, "d2", "d1", undefined, "assigned"));
});
test("team cannot access unassigned ticket of ANOTHER dept", () => {
  assert.ok(!canAccessTicket("team", "u1", "u2", undefined, "d2", "d1"));
});
test("team (assigned-scope, dept-less) cannot see dept tickets", () => {
  assert.ok(!canAccessTicket("team", "u1", "u2", undefined, "d1", undefined, undefined, "assigned"));
});
test("manager with dept can access same-dept ticket", () => {
  assert.ok(canAccessTicket("manager", "u1", "u2", undefined, "d1", "d1"));
});
test("manager cannot access other-dept ticket", () => {
  assert.ok(!canAccessTicket("manager", "u1", "u2", undefined, "d2", "d1"));
});
test("CRITICAL: dept-less manager cannot access dept-less ticket", () => {
  assert.ok(!canAccessTicket("manager", "u1", "u2", undefined, undefined, undefined));
});
test("CRITICAL: dept-less manager cannot access any dept ticket", () => {
  assert.ok(!canAccessTicket("manager", "u1", "u2", undefined, "d2", undefined));
});
test("dept-less manager can access ticket assigned to them", () => {
  assert.ok(canAccessTicket("manager", "u1", "u2", "u1", undefined, undefined));
});
test("unknown role denied", () => {
  assert.ok(!canAccessTicket("hacker", "u1", "u1", undefined, undefined, undefined));
});
test("super_admin allowed", () => {
  assert.ok(canAccessTicket("super_admin", "u1", "u2", undefined, "d9", undefined));
});

console.log("sanitizeSearch (regex injection / ReDoS)");
test("escapes regex metacharacters", () => {
  assert.strictEqual(sanitizeSearch("(a+)+$"), escapeRegExp("(a+)+$"));
  assert.strictEqual(sanitizeSearch("(a+)+$"), "\\(a\\+\\)\\+\\$");
});
test("escapes all Mongo-relevant metacharacters", () => {
  assert.strictEqual(sanitizeSearch(".*[]{}()|^$?+*\\"), "\\.\\*\\[\\]\\{\\}\\(\\)\\|\\^\\$\\?\\+\\*\\\\");
});
test("truncates long input", () => {
  assert.strictEqual(sanitizeSearch("a".repeat(500))?.length, 100);
});
test("drops empty / non-string input", () => {
  assert.strictEqual(sanitizeSearch(""), undefined);
  assert.strictEqual(sanitizeSearch("   "), undefined);
  assert.strictEqual(sanitizeSearch(undefined), undefined);
  assert.strictEqual(sanitizeSearch(123 as unknown as string), undefined);
});

console.log("attachmentMimeAllowed (magic-byte sniffing)");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const HTML = Buffer.from('<html><script>alert(1)</script></html>');
const EXE = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
test("accepts real PNG declared as image/png", () => {
  assert.ok(attachmentMimeAllowed("image/png", PNG));
});
test("rejects HTML declared as image/png (spoofing)", () => {
  assert.ok(!attachmentMimeAllowed("image/png", HTML));
});
test("rejects EXE declared as image/png", () => {
  assert.ok(!attachmentMimeAllowed("image/png", EXE));
});
test("accepts real ZIP declared as application/zip", () => {
  assert.ok(attachmentMimeAllowed("application/zip", ZIP));
});
test("rejects EXE declared as application/zip", () => {
  assert.ok(!attachmentMimeAllowed("application/zip", EXE));
});
test("rejects unknown binary type", () => {
  assert.ok(!attachmentMimeAllowed("application/octet-stream", EXE));
});
test("rejects SVG (not allowlisted)", () => {
  assert.ok(!attachmentMimeAllowed("image/svg+xml", Buffer.from("<svg/>")));
});
test("rejects text/html (not allowlisted)", () => {
  assert.ok(!attachmentMimeAllowed("text/html", HTML));
});
test("text/plain accepted without sniffing", () => {
  assert.ok(attachmentMimeAllowed("text/plain", Buffer.from("hello")));
});
test("csv accepted", () => {
  assert.ok(attachmentMimeAllowed("text/csv", Buffer.from("a,b\n1,2")));
});
test("pdf magic checked", () => {
  assert.ok(attachmentMimeAllowed("application/pdf", Buffer.from("%PDF-1.7 ...")));
  assert.ok(!attachmentMimeAllowed("application/pdf", HTML));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
}

main();
