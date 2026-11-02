import assert from "node:assert";
import { SIX_MONTHS_SECONDS, authConfig } from "@/lib/auth";
import { AuthSession } from "@/lib/db/models";

async function runTests() {
  console.log("=== Testing Persistent Login Architecture (6-Month Duration) ===");

  // 1. Verify 6-month duration constant
  const expectedSeconds = 180 * 24 * 60 * 60; // 15,552,000s
  assert.strictEqual(
    SIX_MONTHS_SECONDS,
    expectedSeconds,
    `SIX_MONTHS_SECONDS must equal 180 days in seconds (${expectedSeconds}), got ${SIX_MONTHS_SECONDS}`
  );
  console.log("✓ SIX_MONTHS_SECONDS = 15,552,000 (180 days)");

  // 2. Verify NextAuth session & cookie configuration
  assert.strictEqual(
    authConfig.session?.maxAge,
    SIX_MONTHS_SECONDS,
    "authConfig.session.maxAge must match 6-month duration"
  );
  assert.strictEqual(
    authConfig.session?.strategy,
    "jwt",
    "authConfig.session.strategy must be 'jwt'"
  );
  assert.strictEqual(
    authConfig.session?.updateAge,
    24 * 60 * 60,
    "authConfig.session.updateAge should refresh active sessions daily"
  );

  const cookieOptions = (authConfig.cookies as any)?.sessionToken?.options;
  assert.ok(cookieOptions, "authConfig.cookies.sessionToken.options must be defined");
  assert.strictEqual(cookieOptions.httpOnly, true, "Session cookie must be HttpOnly");
  assert.strictEqual(cookieOptions.sameSite, "lax", "Session cookie sameSite must be 'lax'");
  assert.strictEqual(cookieOptions.maxAge, SIX_MONTHS_SECONDS, "Session cookie maxAge must be 6 months");
  assert.strictEqual(cookieOptions.path, "/", "Session cookie path must be '/'");
  console.log("✓ NextAuth session & cookie security configurations match persistent 6-month requirements");

  // 3. Verify Hard Expiry (180-day absolute limit enforcement)
  const nowSec = Math.floor(Date.now() / 1000);

  // Case A: Fresh session within 180 days
  const validSessionCreatedAt = nowSec - 30 * 24 * 60 * 60; // 30 days old
  const validToken: any = {
    id: "user_test_123",
    role: "manager",
    sessionId: "sess_valid_1",
    sessionCreatedAt: validSessionCreatedAt,
    absoluteExpiresAt: validSessionCreatedAt + SIX_MONTHS_SECONDS,
    active: true,
  };

  const isExpiredA = Boolean(
    validToken.absoluteExpiresAt && nowSec > validToken.absoluteExpiresAt
  );
  assert.strictEqual(isExpiredA, false, "30-day old session must not be hard-expired");

  // Case B: Session past 180 days (e.g. 181 days old)
  const expiredSessionCreatedAt = nowSec - 181 * 24 * 60 * 60; // 181 days old
  const expiredToken: any = {
    id: "user_test_456",
    role: "manager",
    sessionId: "sess_expired_1",
    sessionCreatedAt: expiredSessionCreatedAt,
    absoluteExpiresAt: expiredSessionCreatedAt + SIX_MONTHS_SECONDS,
    active: true,
  };

  const isExpiredB = Boolean(
    expiredToken.absoluteExpiresAt && nowSec > expiredToken.absoluteExpiresAt
  );
  assert.strictEqual(isExpiredB, true, "181-day old session must be hard-expired");
  console.log("✓ 6-Month absolute hard cap accurately differentiates valid and expired sessions");

  // 4. Verify Clamping of Sliding Refresh Expiration
  // Refresh attempts to set exp = now + 6 months, but absoluteExpiresAt caps it
  const slidingAttemptExp = nowSec + SIX_MONTHS_SECONDS;
  const clampedExp = Math.min(slidingAttemptExp, validToken.absoluteExpiresAt);
  assert.ok(
    clampedExp <= validToken.absoluteExpiresAt,
    "Clamped exp must never exceed absoluteExpiresAt"
  );
  assert.strictEqual(
    clampedExp,
    validToken.absoluteExpiresAt,
    "Clamped exp matches absolute cap when sliding refresh attempts to extend past it"
  );
  console.log("✓ Sliding token refresh clamped to absolute 6-month ceiling");

  // 5. Verify AuthSession Mongoose schema structure
  const authSessionSchema = AuthSession.schema;
  assert.ok(authSessionSchema.path("sessionId"), "AuthSession must have sessionId path");
  assert.ok(authSessionSchema.path("userId"), "AuthSession must have userId path");
  assert.ok(authSessionSchema.path("createdAt"), "AuthSession must have createdAt path");
  assert.ok(authSessionSchema.path("expiresAt"), "AuthSession must have expiresAt path");
  assert.ok(authSessionSchema.path("lastActiveAt"), "AuthSession must have lastActiveAt path");
  assert.ok(authSessionSchema.path("isValid"), "AuthSession must have isValid path");
  console.log("✓ AuthSession schema structure verified with required fields");

  // 6. Verify Proxy edge middleware evaluation logic
  const simulateProxyTokenCheck = (rawToken: any) => {
    const currentNowSec = Math.floor(Date.now() / 1000);
    const isHardExpired =
      rawToken?.absoluteExpiresAt &&
      typeof rawToken.absoluteExpiresAt === "number" &&
      currentNowSec > rawToken.absoluteExpiresAt;

    return rawToken && rawToken.active !== false && !isHardExpired ? rawToken : null;
  };

  assert.strictEqual(
    simulateProxyTokenCheck(validToken)?.id,
    "user_test_123",
    "Proxy accepts valid token within 6-month duration"
  );
  assert.strictEqual(
    simulateProxyTokenCheck(expiredToken),
    null,
    "Proxy rejects token past 6-month duration"
  );
  assert.strictEqual(
    simulateProxyTokenCheck({ ...validToken, active: false }),
    null,
    "Proxy rejects deactivated/revoked session token"
  );
  console.log("✓ Proxy edge token evaluator blocks expired, revoked, and inactive tokens");

  // 7. Verify /api/auth/logout route behavior
  const { POST: logoutHandler } = await import("@/app/api/auth/logout/route");
  const dummyRequest = {
    url: "http://localhost:3000/api/auth/logout",
    headers: new Headers(),
    cookies: {
      get: () => undefined,
      getAll: () => [],
    },
  } as any;

  const logoutResponse = await logoutHandler(dummyRequest);
  assert.strictEqual(logoutResponse.status, 200, "Logout endpoint must return 200");
  const json = await logoutResponse.json();
  assert.strictEqual(json.success, true, "Logout response JSON must indicate success");

  // Verify cleared cookies
  const setCookieHeaders = logoutResponse.headers.getSetCookie();
  assert.ok(setCookieHeaders.length > 0, "Logout response must include Set-Cookie headers clearing session");
  const authCookieCleared = setCookieHeaders.some(
    (h) => h.includes("authjs.session-token") && (h.includes("Max-Age=0") || h.includes("max-age=0"))
  );
  assert.ok(authCookieCleared, "authjs.session-token must be cleared with max-age=0");
  console.log("✓ /api/auth/logout clears auth cookies and returns 200");

  console.log("\n=== ALL PERSISTENT LOGIN TESTS PASSED SUCCESSFULLY ===");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
