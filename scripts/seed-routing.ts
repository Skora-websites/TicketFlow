// Seed wrapper. Stubs the "server-only" guard so we can run the seed outside of Next.
// Run with: `node_modules/.bin/tsx scripts/seed-routing.ts`
import Module from "node:module";

// Stub server-only to a no-op before any project modules load.
const original = (Module.prototype as any).require;
(Module.prototype as any).require = function (id: string) {
  if (id === "server-only") return {};
  return original.apply(this, arguments as any);
};

// Load .env.local manually (Next normally does this for us)
import { readFileSync } from "node:fs";
import { join } from "node:path";

function loadDotenv() {
  try {
    const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2];
      }
    }
  } catch {
    /* ignore */
  }
}

loadDotenv();

async function run() {
  const { seed } = await import("../src/lib/db/seed");
  await seed();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
