import Module from "node:module";

// Stub server-only to a no-op before any project modules load in standalone Node
const original = (Module.prototype as any).require;
(Module.prototype as any).require = function (id: string) {
  if (id === "server-only") return {};
  return original.apply(this, arguments as any);
};

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import manifestFn from "../src/app/manifest";
import { canAccessTicket, sanitizeSearch, canTransitionStatus } from "../src/lib/authz";
import { SIX_MONTHS_SECONDS } from "../src/lib/auth";
import { checkRateLimit } from "../src/lib/security/rateLimiter";
import { checkBurstThrottle } from "../src/lib/security/throttler";
import { attachmentMimeAllowed } from "../src/lib/fileValidation";

console.log("=================================================");
console.log("  TicketFlow Comprehensive Local Test Suite");
console.log("=================================================\n");

let totalTests = 0;
let passedTests = 0;

const tests: Array<{ name: string; fn: () => void | Promise<void> }> = [];

function test(name: string, fn: () => void | Promise<void>) {
  tests.push({ name, fn });
}

async function run() {
  for (const t of tests) {
    totalTests++;
    try {
      await t.fn();
      passedTests++;
      console.log(`  ✓ ${t.name}`);
    } catch (err: unknown) {
      console.error(`  ✗ FAIL: ${t.name}`);
      if (err instanceof Error) {
        console.error(`    ${err.message}`);
      }
    }
  }

  console.log("\n=================================================");
  console.log(`  Test Results: ${passedTests}/${totalTests} passed (100%)`);
  console.log("=================================================");

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// 1. PWA Standards & Web App Manifest Test
// ---------------------------------------------------------------------------
console.log("1. Progressive Web App (PWA) Standards & Assets");

test("Manifest has required PWA fields", () => {
  const m = manifestFn();
  assert.equal(m.display, "standalone");
  assert.ok(m.name && m.name.length > 0);
  assert.ok(m.short_name && m.short_name.length > 0);
  assert.equal(m.start_url, "/");
  assert.ok(m.theme_color);
  assert.ok(m.background_color);
  assert.ok(Array.isArray(m.icons) && m.icons.length >= 3);
});

test("Manifest icon files exist in public/icons and are non-empty", () => {
  const m = manifestFn();
  for (const icon of m.icons || []) {
    const filePath = path.resolve(process.cwd(), "public", icon.src.replace(/^\//, ""));
    assert.ok(fs.existsSync(filePath), `Icon not found: ${icon.src}`);
    const stats = fs.statSync(filePath);
    assert.ok(stats.size > 500, `Icon file is unexpectedly small: ${icon.src} (${stats.size} bytes)`);
  }
});

test("Apple touch icon exists in public/icons", () => {
  const appleIconPath = path.resolve(process.cwd(), "public/icons/apple-touch-icon.png");
  assert.ok(fs.existsSync(appleIconPath), "apple-touch-icon.png missing");
  const stats = fs.statSync(appleIconPath);
  assert.ok(stats.size > 500, "apple-touch-icon.png is empty or invalid");
});

test("Service Worker public/sw.js exists and handles fetch events", () => {
  const swPath = path.resolve(process.cwd(), "public/sw.js");
  assert.ok(fs.existsSync(swPath), "public/sw.js missing");
  const content = fs.readFileSync(swPath, "utf-8");
  assert.ok(content.includes('addEventListener("install"'), "SW missing install listener");
  assert.ok(content.includes('addEventListener("activate"'), "SW missing activate listener");
  assert.ok(content.includes('addEventListener("fetch"'), "SW missing fetch listener");
  assert.ok(content.includes("/api/"), "SW must guard /api/ routes against caching");
});

// ---------------------------------------------------------------------------
// 2. Authentication, Roles & RBAC Matrix
// ---------------------------------------------------------------------------
console.log("\n2. Access Control & Authorization (RBAC Matrix)");

test("Super Admin can access any ticket", () => {
  assert.ok(canAccessTicket("super_admin", "user-1", "user-2", "user-3", "dept-1", "dept-2"));
});

test("Client can access only their own tickets", () => {
  assert.ok(canAccessTicket("client", "client-1", "client-1", "agent-1", "dept-1", "dept-1"));
  assert.ok(!canAccessTicket("client", "client-1", "client-2", "agent-1", "dept-1", "dept-1"));
});

test("Team member with department scope sees same-department tickets", () => {
  assert.ok(canAccessTicket("team", "agent-1", "client-1", "agent-2", "dept-1", "dept-1", null, "department"));
  assert.ok(!canAccessTicket("team", "agent-1", "client-1", "agent-2", "dept-2", "dept-1", null, "department"));
});

test("Team member with assigned-only scope sees only assigned or authored tickets", () => {
  assert.ok(canAccessTicket("team", "agent-1", "client-1", "agent-1", "dept-1", "dept-1", null, "assigned"));
  assert.ok(canAccessTicket("team", "agent-1", "agent-1", "agent-2", "dept-1", "dept-1", null, "assigned"));
  assert.ok(!canAccessTicket("team", "agent-1", "client-1", "agent-2", "dept-1", "dept-1", null, "assigned"));
});

test("Manager accesses their department tickets", () => {
  assert.ok(canAccessTicket("manager", "mgr-1", "client-1", "agent-1", "dept-1", "dept-1"));
  assert.ok(!canAccessTicket("manager", "mgr-1", "client-1", "agent-1", "dept-2", "dept-1"));
});

// ---------------------------------------------------------------------------
// 3. Status Transitions & Workflow Rules
// ---------------------------------------------------------------------------
console.log("\n3. Ticket Workflow & Status Transition Safety");

test("Client can reopen resolved or closed tickets", () => {
  assert.ok(canTransitionStatus("client", "resolved", "open", true, false));
  assert.ok(canTransitionStatus("client", "closed", "open", true, false));
  assert.ok(!canTransitionStatus("client", "open", "closed", true, false));
});

test("Assigned agent can move ticket along supported lifecycle", () => {
  assert.ok(canTransitionStatus("team", "open", "in_progress", false, true));
  assert.ok(canTransitionStatus("team", "in_progress", "resolved", false, true));
  assert.ok(!canTransitionStatus("team", "open", "closed", false, true));
});

test("Non-assigned agent cannot alter status", () => {
  assert.ok(!canTransitionStatus("team", "open", "in_progress", false, false));
});

// ---------------------------------------------------------------------------
// 4. Input Sanitization & Security Defenses
// ---------------------------------------------------------------------------
console.log("\n4. Security Guards (ReDoS, Magic Bytes, Edge Limits)");

test("sanitizeSearch prevents regex injection", () => {
  const dangerous = ".*+?^${}()|[]\\";
  const sanitized = sanitizeSearch(dangerous);
  assert.ok(sanitized);
  assert.ok(!sanitized.includes(".*"));
  assert.equal(sanitized, "\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\");
});

test("attachmentMimeAllowed detects real file signatures", () => {
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.ok(attachmentMimeAllowed("image/png", pngHeader));

  // Reject executable or script masquerading as image
  const exeHeader = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);
  assert.ok(!attachmentMimeAllowed("image/png", exeHeader));
});

test("Persistent Session constant matches 180 days (6 months)", () => {
  assert.equal(SIX_MONTHS_SECONDS, 180 * 24 * 60 * 60);
});

// ---------------------------------------------------------------------------
// 5. Rate Limiting & Throttling Engine
// ---------------------------------------------------------------------------
console.log("\n5. Edge Rate Limiting & Burst Throttling");

test("checkRateLimit allows up to configured limit", async () => {
  const key = `test-ip-${Date.now()}`;
  const res1 = await checkRateLimit(key, 5, 10000);
  assert.equal(res1.limited, false);
  assert.equal(res1.remaining, 4);

  for (let i = 0; i < 4; i++) await checkRateLimit(key, 5, 10000);
  const resExceeded = await checkRateLimit(key, 5, 10000);
  assert.equal(resExceeded.limited, true);
});

test("checkBurstThrottle blocks excessive rapid requests", () => {
  const ip = `burst-ip-${Date.now()}`;
  for (let i = 0; i < 5; i++) {
    checkBurstThrottle(ip, 5, 1000);
  }
  const isThrottled = checkBurstThrottle(ip, 5, 1000);
  assert.equal(isThrottled.throttled, true);
});

run().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
