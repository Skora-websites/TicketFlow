/**
 * Runtime core — the one layer behind the app's "single-instance cliffs":
 *
 *   1. Rate limiting  (was src/lib/rateLimit.ts — in-memory Map)
 *   2. Ticket event bus for SSE  (was src/lib/events.ts — globalThis registry)
 *   3. Presence / collision detection  (new — e.g. "2 agents viewing")
 *
 * The in-memory driver is the default and is created synchronously, so the
 * event bus keeps its exact current semantics (sync publish/subscribe — zero
 * call-site changes). When RUNTIME_DRIVER=redis, the Redis driver is loaded
 * lazily and swaps in as soon as it's ready (a boot-window of events may
 * still flow through the memory driver; SSE clients reconcile on the next
 * delta fetch). If Redis can't load (missing ioredis / REDIS_URL), the app
 * stays on memory with a loud error — fail-open, never fail-closed.
 *
 * `ioredis` is intentionally NOT in package.json. To go multi-instance:
 *   npm i ioredis
 *   RUNTIME_DRIVER=redis REDIS_URL=redis://... npm start
 */

import type {
  PresenceEntry,
  RuntimeDriver,
  TicketEventType,
  TicketListener,
} from "./types";
import { createMemoryRuntime } from "./memoryDriver";

export type {
  PresenceEntry,
  RateLimiterDriver,
  RuntimeDriver,
  TicketEvent,
  TicketEventType,
  TicketListener,
} from "./types";

interface RuntimeState {
  driver: RuntimeDriver;
  redisSwapStarted: boolean;
}

const g = globalThis as unknown as { __ticketRuntime?: RuntimeState };

function runtimeState(): RuntimeState {
  if (!g.__ticketRuntime) {
    // Cached on globalThis so dev HMR (module re-eval) doesn't fork the
    // registries and silently drop live updates.
    g.__ticketRuntime = { driver: createMemoryRuntime(), redisSwapStarted: false };
  }
  return g.__ticketRuntime;
}

/** Kick off the (one-time) async swap to Redis if configured. */
function maybeStartRedisSwap(): void {
  const s = runtimeState();
  if (s.redisSwapStarted || process.env.RUNTIME_DRIVER !== "redis") return;
  s.redisSwapStarted = true;
  import("./redisDriver")
    .then((m) => m.createRedisRuntime())
    .then((driver) => {
      s.driver = driver;
      console.log("[runtime] switched to the redis driver (multi-instance mode)");
    })
    .catch((err) => {
      console.error(
        "[runtime] RUNTIME_DRIVER=redis failed to load (is ioredis installed and REDIS_URL set?). " +
          "Staying on the in-memory driver — do NOT scale to multiple instances until this is fixed.",
        err
      );
    });
}

/** Which driver is currently serving (observability/tests). */
export function getRuntimeDriverName(): "memory" | "redis" {
  return runtimeState().driver.name;
}

/** Fixed-window rate limiter. Resolves true when OVER the limit (reject). */
export async function checkRate(key: string, limit: number, windowMs: number): Promise<boolean> {
  maybeStartRedisSwap();
  return runtimeState().driver.checkRate(key, limit, windowMs);
}

/** Notify every open SSE stream for this ticket. Fire-and-forget. */
export function publishTicketEvent(ticketId: string, type: TicketEventType): void {
  maybeStartRedisSwap();
  runtimeState().driver.publish(ticketId, type);
}

/** Watch a ticket's events; returns a sync unsubscribe function. */
export function subscribeTicket(ticketId: string, listener: TicketListener): () => void {
  maybeStartRedisSwap();
  return runtimeState().driver.subscribe(ticketId, listener);
}

/** Mark `id` present in `zone` (e.g. `ticket:<id>`) for ttlMs. */
export async function touchPresence(zone: string, id: string, ttlMs?: number): Promise<void> {
  maybeStartRedisSwap();
  return runtimeState().driver.touch(zone, id, ttlMs);
}

/** Live members of a zone, newest-first. */
export async function listPresence(zone: string): Promise<PresenceEntry[]> {
  maybeStartRedisSwap();
  return runtimeState().driver.list(zone);
}

/** Test/debug hook: run `fn` against the active driver. */
export async function withRuntime<T>(fn: (driver: RuntimeDriver) => Promise<T> | T): Promise<T> {
  return fn(runtimeState().driver);
}
