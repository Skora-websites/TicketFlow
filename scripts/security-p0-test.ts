/**
 * Regression tests for the P0 security fixes:
 *  - avatar data URLs must be allowlisted raster images (no stored XSS)
 *  - production configuration must fail fast without a real AUTH_SECRET
 *  - the database URI must never fall back to a checked-in credential
 *
 * Run: npx tsx scripts/security-p0-test.ts
 */
import Module from "node:module";
import assert from "node:assert";

// Stub server-only to a no-op before any project modules load (these guards
// only apply inside Next; same trick as the other audit scripts).
const original = (Module.prototype as any).require;
(Module.prototype as any).require = function (id: string) {
  if (id === "server-only") return {};
  return original.apply(this, arguments as any);
};

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
  const { parseAvatarDataUrl, detectAvatarMime, MAX_AVATAR_BYTES } = await import(
    "../src/lib/avatar"
  );
  const { getAuthSecret, getMongoUri } = await import("../src/lib/env");

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(8),
  ]);
  const webp = Buffer.concat([
    Buffer.from("RIFF"),
    Buffer.from([0, 0, 0, 0]),
    Buffer.from("WEBP"),
  ]);
  const html = Buffer.from("<html><script>alert(1)</script></html>");

  console.log("avatar data URL validation");
  test("accepts a PNG whose bytes match the declared type", () => {
    const parsed = parseAvatarDataUrl(`data:image/png;base64,${png.toString("base64")}`);
    assert.ok(parsed);
    assert.strictEqual(parsed!.mime, "image/png");
    assert.ok(parsed!.dataUrl.startsWith("data:image/png;base64,"));
  });
  test("accepts WebP detected from magic bytes", () => {
    assert.ok(parseAvatarDataUrl(`data:image/webp;base64,${webp.toString("base64")}`));
  });
  test("rejects a declared SVG data URL", () => {
    assert.strictEqual(
      parseAvatarDataUrl(`data:image/svg+xml;base64,${Buffer.from("<svg/>").toString("base64")}`),
      null
    );
  });
  test("rejects HTML bytes declared as PNG", () => {
    assert.strictEqual(
      parseAvatarDataUrl(`data:image/png;base64,${html.toString("base64")}`),
      null
    );
  });
  test("rejects a text/html data URL", () => {
    assert.strictEqual(
      parseAvatarDataUrl(`data:text/html;base64,${html.toString("base64")}`),
      null
    );
  });
  test("rejects a MIME that does not match the bytes", () => {
    assert.strictEqual(
      parseAvatarDataUrl(`data:image/jpeg;base64,${png.toString("base64")}`),
      null
    );
  });
  test("rejects images over the size cap", () => {
    const big = Buffer.concat([png, Buffer.alloc(MAX_AVATAR_BYTES)]);
    assert.strictEqual(
      parseAvatarDataUrl(`data:image/png;base64,${big.toString("base64")}`),
      null
    );
  });
  test("serving-side detection refuses non-images", () => {
    assert.strictEqual(detectAvatarMime(html), null);
    assert.strictEqual(detectAvatarMime(png), "image/png");
  });

  console.log("production configuration fail-fast");
  const saved: Record<string, string | undefined> = {
    NODE_ENV: process.env.NODE_ENV,
    AUTH_SECRET: process.env.AUTH_SECRET,
    VERCEL_ENV: process.env.VERCEL_ENV,
    MONGODB_URI: process.env.MONGODB_URI,
  };
  try {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    delete process.env.AUTH_SECRET;
    delete process.env.VERCEL_ENV;

    test("refuses to start without AUTH_SECRET", () => {
      assert.throws(() => getAuthSecret(), /AUTH_SECRET/);
    });
    test("refuses a too-short AUTH_SECRET", () => {
      process.env.AUTH_SECRET = "too-short";
      assert.throws(() => getAuthSecret(), /AUTH_SECRET/);
    });
    test("returns a valid AUTH_SECRET unchanged", () => {
      const good = "x".repeat(48);
      process.env.AUTH_SECRET = good;
      assert.strictEqual(getAuthSecret(), good);
    });
    test("refuses to connect without MONGODB_URI", () => {
      delete process.env.MONGODB_URI;
      assert.throws(() => getMongoUri(), /MONGODB_URI/);
    });
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
