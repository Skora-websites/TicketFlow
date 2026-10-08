/**
 * Runtime core — Redis driver (multi-instance).
 *
 * Selected by RUNTIME_DRIVER=redis (+ REDIS_URL). `ioredis` is an OPTIONAL
 * dependency: it is loaded lazily at runtime so neither tsc nor webpack needs
 * it installed unless you actually flip the switch (the non-literal import
 * specifier + webpackIgnore keeps bundlers out of it).
 *
 * Failure posture is fail-open, matching the runtime contract: if Redis is
 * unreachable the request path must not break — rate checks pass, publishes
 * drop, subscriptions stay silent — and the error is logged once per call
 * site category.
 */

import type {
  PresenceEntry,
  RuntimeDriver,
  TicketEventType,
  TicketListener,
} from "./types";

const PKG = "ioredis";

/** The subset of the ioredis client API this driver uses. */
interface RedisLike {
  incr(key: string): Promise<number>;
  pexpire(key: string, ms: number): Promise<number>;
  zadd(key: string, score: number, member: string): Promise<number>;
  zremrangebyscore(key: string, min: number | string, max: number | string): Promise<number>;
  zrangebyscore(key: string, min: number | string, max: number | string): Promise<string[]>;
  publish(channel: string, message: string): Promise<number>;
  subscribe(...channels: string[]): Promise<unknown>;
  unsubscribe(...channels: string[]): Promise<unknown>;
  on(event: string, cb: (...args: never[]) => void): RedisLike;
  duplicate(): RedisLike;
  quit(): Promise<string>;
}

type RedisConstructor = new (url: string) => RedisLike;

async function loadRedisConstructor(): Promise<RedisConstructor> {
  // Non-literal specifier so TypeScript does not require @types for an
  // optional package; webpackIgnore keeps the bundler from resolving it.
  const mod = (await import(/* webpackIgnore: true */ PKG)) as
    | { default?: RedisConstructor }
    | RedisConstructor;
  const ctor =
    typeof mod === "function" ? mod : (mod as { default?: RedisConstructor }).default;
  if (typeof ctor !== "function") {
    throw new Error("ioredis did not export a constructor");
  }
  return ctor;
}

const CHANNEL_PREFIX = "tf:ticket:";
const RATE_PREFIX = "tf:rl:";
const PRESENCE_PREFIX = "tf:presence:";
const DEFAULT_PRESENCE_TTL_MS = 30_000;

function logOnce(tag: string, err: unknown): void {
  const g = globalThis as unknown as { __ticketRuntimeRedisErrors?: Set<string> };
  if (!g.__ticketRuntimeRedisErrors) g.__ticketRuntimeRedisErrors = new Set();
  if (g.__ticketRuntimeRedisErrors.has(tag)) return;
  g.__ticketRuntimeRedisErrors.add(tag);
  console.error(`[runtime:redis] ${tag} failed — failing open:`, err);
}

export async function createRedisRuntime(url?: string): Promise<RuntimeDriver> {
  const redisUrl = url ?? process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error("RUNTIME_DRIVER=redis requires REDIS_URL to be set");
  }
  const Redis = await loadRedisConstructor();
  const publisher = new Redis(redisUrl);
  const subscriber = publisher.duplicate();

  // Per-channel listener registry; the Redis subscription is joined lazily
  // on the first listener and dropped when the last one leaves.
  const listeners = new Map<string, Set<TicketListener>>();

  subscriber.on("message", ((channel: string, payload: string) => {
    const set = listeners.get(channel);
    if (!set || set.size === 0) return;
    let type: TicketEventType;
    let at: string;
    try {
      const parsed = JSON.parse(payload) as { type?: TicketEventType; at?: string };
      type = parsed.type ?? "comment";
      at = parsed.at ?? new Date().toISOString();
    } catch {
      type = "comment";
      at = new Date().toISOString();
    }
    for (const fn of set) {
      try {
        fn({ type, at });
      } catch {
        // A broken stream must never break the publish path.
      }
    }
  }) as (...args: never[]) => void);

  subscriber.on("error", ((err: unknown) => logOnce("subscriber connection", err)) as (...args: never[]) => void);
  publisher.on("error", ((err: unknown) => logOnce("publisher connection", err)) as (...args: never[]) => void);

  return {
    name: "redis",

    async checkRate(key, limit, windowMs) {
      try {
        const n = await publisher.incr(RATE_PREFIX + key);
        if (n === 1) await publisher.pexpire(RATE_PREFIX + key, windowMs);
        return n > limit;
      } catch (err) {
        logOnce("checkRate", err);
        return false; // fail open — never lock users out because Redis is down
      }
    },

    publish(ticketId, type) {
      const channel = CHANNEL_PREFIX + ticketId;
      const message = JSON.stringify({ type, at: new Date().toISOString() });
      // Fire-and-forget: ioredis queues while connecting, and a dropped
      // event only means the next poll/heartbeat reconciles.
      void publisher.publish(channel, message).catch((err: unknown) => logOnce("publish", err));
    },

    subscribe(ticketId, listener) {
      const channel = CHANNEL_PREFIX + ticketId;
      let set = listeners.get(channel);
      if (!set) {
        set = new Set();
        listeners.set(channel, set);
        void subscriber.subscribe(channel).catch((err: unknown) => logOnce("subscribe", err));
      }
      set.add(listener);
      return () => {
        const current = listeners.get(channel);
        if (!current) return;
        current.delete(listener);
        if (current.size === 0) {
          listeners.delete(channel);
          void subscriber.unsubscribe(channel).catch((err: unknown) => logOnce("unsubscribe", err));
        }
      };
    },

    async touch(zone, id, ttlMs) {
      const ttl = ttlMs ?? DEFAULT_PRESENCE_TTL_MS;
      const now = Date.now();
      const key = PRESENCE_PREFIX + zone;
      const member = JSON.stringify({ id, lastSeenAt: now });
      try {
        await publisher.zadd(key, now + ttl, member);
      } catch (err) {
        logOnce("presence touch", err);
      }
    },

    async list(zone) {
      const key = PRESENCE_PREFIX + zone;
      const now = Date.now();
      try {
        await publisher.zremrangebyscore(key, "-inf", now); // purge expired
        const members = await publisher.zrangebyscore(key, now, "+inf");
        return members
          .map((raw) => {
            try {
              return JSON.parse(raw) as PresenceEntry;
            } catch {
              return null;
            }
          })
          .filter((entry): entry is PresenceEntry => entry !== null)
          .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
      } catch (err) {
        logOnce("presence list", err);
        return [];
      }
    },

    async close() {
      await Promise.allSettled([publisher.quit(), subscriber.quit()]);
    },
  };
}
