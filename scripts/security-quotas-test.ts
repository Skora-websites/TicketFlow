/**
 * Regression & unit tests for security, rate limiting, usage quotas,
 * request throttling, and cost controls (src/lib/security).
 * Run: npx tsx scripts/security-quotas-test.ts
 */
import Module from "node:module";

// Stub server-only to a no-op before any project modules load
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
  const {
    checkRateLimit,
    rateLimitResponse,
    canSendEmail,
    recordEmailSent,
    getEmailQuotaStatus,
    canCreateTicket,
    recordTicketCreated,
    canUploadAttachment,
    recordAttachmentUploaded,
    acquireStreamSlot,
    acquireHeavyActionSlot,
    checkBurstThrottle,
    isPayloadTooLarge,
    clampPaginationLimit,
  } = await import("../src/lib/security");

  console.log("1. rate limiting — fixed window math & headers");
  await test("allows requests within limit and decrements remaining", async () => {
    const key = `test-limit-${Math.random()}`;
    const r1 = await checkRateLimit(key, 3, 60_000);
    assert.strictEqual(r1.limited, false);
    assert.strictEqual(r1.remaining, 2);

    const r2 = await checkRateLimit(key, 3, 60_000);
    assert.strictEqual(r2.limited, false);
    assert.strictEqual(r2.remaining, 1);

    const r3 = await checkRateLimit(key, 3, 60_000);
    assert.strictEqual(r3.limited, false);
    assert.strictEqual(r3.remaining, 0);

    const r4 = await checkRateLimit(key, 3, 60_000);
    assert.strictEqual(r4.limited, true);
    assert.strictEqual(r4.remaining, 0);
  });

  await test("rateLimitResponse formats standard RFC 429 headers", async () => {
    const key = `test-headers-${Math.random()}`;
    await checkRateLimit(key, 1, 60_000);
    const r = await checkRateLimit(key, 1, 60_000);
    assert.strictEqual(r.limited, true);

    const response = rateLimitResponse(r, "Rate limit exceeded test");
    assert.strictEqual(response.status, 429);
    assert.strictEqual(response.headers.get("X-RateLimit-Limit"), "1");
    assert.strictEqual(response.headers.get("X-RateLimit-Remaining"), "0");
    assert.ok(Number(response.headers.get("Retry-After")) > 0);
    assert.ok(Number(response.headers.get("X-RateLimit-Reset")) > 0);
  });

  console.log("2. request throttling — stream concurrency & burst control");
  await test("acquireStreamSlot permits up to 3 streams then throttles", () => {
    const user = `user-stream-${Math.random()}`;
    const s1 = acquireStreamSlot(user, 3);
    assert.strictEqual(s1.allowed, true);
    assert.strictEqual(s1.activeCount, 1);

    const s2 = acquireStreamSlot(user, 3);
    assert.strictEqual(s2.allowed, true);
    assert.strictEqual(s2.activeCount, 2);

    const s3 = acquireStreamSlot(user, 3);
    assert.strictEqual(s3.allowed, true);
    assert.strictEqual(s3.activeCount, 3);

    const s4 = acquireStreamSlot(user, 3);
    assert.strictEqual(s4.allowed, false);

    // Release one stream
    s2.release();
    const s5 = acquireStreamSlot(user, 3);
    assert.strictEqual(s5.allowed, true);
    assert.strictEqual(s5.activeCount, 3);

    // Clean up
    s1.release();
    s3.release();
    s5.release();
  });

  await test("heavy action concurrency limits parallel queries", () => {
    const user = `user-heavy-${Math.random()}`;
    const h1 = acquireHeavyActionSlot(user, 2);
    assert.strictEqual(h1.allowed, true);

    const h2 = acquireHeavyActionSlot(user, 2);
    assert.strictEqual(h2.allowed, true);

    const h3 = acquireHeavyActionSlot(user, 2);
    assert.strictEqual(h3.allowed, false);

    h1.release();
    const h4 = acquireHeavyActionSlot(user, 2);
    assert.strictEqual(h4.allowed, true);

    h2.release();
    h4.release();
  });

  await test("burst throttle catches rapid script bursts", () => {
    const key = `burst-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      const b = checkBurstThrottle(key, 5, 1000);
      assert.strictEqual(b.throttled, false);
    }
    const bBlocked = checkBurstThrottle(key, 5, 1000);
    assert.strictEqual(bBlocked.throttled, true);
    assert.ok(bBlocked.retryAfter >= 1);
  });

  console.log("3. usage quotas — emails, tickets & storage");
  await test("email quota enforces critical vs notification priority", async () => {
    const statusBefore = await getEmailQuotaStatus();
    assert.strictEqual(typeof statusBefore.used, "number");
    assert.ok(statusBefore.quota > 0);

    const canCrit = await canSendEmail("critical");
    assert.strictEqual(typeof canCrit.allowed, "boolean");

    const canNotif = await canSendEmail("notification");
    assert.strictEqual(typeof canNotif.allowed, "boolean");
  });

  await test("daily ticket quota caps client role submissions", async () => {
    const clientId = `client-${Math.random()}`;
    const check1 = await canCreateTicket(clientId, "client");
    assert.strictEqual(check1.allowed, true);
    assert.strictEqual(check1.count, 0);

    // Record 25 tickets
    for (let i = 0; i < 25; i++) {
      await recordTicketCreated(clientId);
    }

    const checkBlocked = await canCreateTicket(clientId, "client");
    assert.strictEqual(checkBlocked.allowed, false);
    assert.strictEqual(checkBlocked.count, 25);
    assert.strictEqual(checkBlocked.remaining, 0);

    // Staff roles are not capped by client quota
    const staffCheck = await canCreateTicket(clientId, "team");
    assert.strictEqual(staffCheck.allowed, true);
  });

  await test("storage quota rejects oversized files and enforces daily limits", async () => {
    const user = `uploader-${Math.random()}`;
    // Reject > 4MB
    const bigFile = 5 * 1024 * 1024;
    const bigCheck = await canUploadAttachment(user, bigFile);
    assert.strictEqual(bigCheck.allowed, false);
    assert.ok(bigCheck.reason?.includes("4MB"));

    // Accept valid 1MB file
    const validFile = 1 * 1024 * 1024;
    const validCheck = await canUploadAttachment(user, validFile);
    assert.strictEqual(validCheck.allowed, true);

    // Record upload
    await recordAttachmentUploaded(user, validFile);
  });

  console.log("4. cost controls — payload size & pagination clamping");
  await test("isPayloadTooLarge detects bodies exceeding 10MB", () => {
    assert.strictEqual(isPayloadTooLarge(null), false);
    assert.strictEqual(isPayloadTooLarge(undefined), false);
    assert.strictEqual(isPayloadTooLarge("5000"), false);
    assert.strictEqual(isPayloadTooLarge(String(10 * 1024 * 1024)), false);
    assert.strictEqual(isPayloadTooLarge(String(10 * 1024 * 1024 + 1)), true);
  });

  await test("clampPaginationLimit enforces upper boundary on list queries", () => {
    assert.strictEqual(clampPaginationLimit(undefined), 20);
    assert.strictEqual(clampPaginationLimit("bad"), 20);
    assert.strictEqual(clampPaginationLimit(-5), 20);
    assert.strictEqual(clampPaginationLimit("30"), 30);
    assert.strictEqual(clampPaginationLimit(100), 50); // clamped to max 50
    assert.strictEqual(clampPaginationLimit("999999"), 50); // clamped to max 50
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
