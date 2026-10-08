/**
 * Runtime core — in-memory driver (the default).
 *
 * Single-process scope by design: state lives on globalThis so Next.js dev
 * HMR (module re-eval) doesn't fork the registries and silently drop live
 * updates. A multi-instance deployment must switch to the redis driver
 * (RUNTIME_DRIVER=redis).
 */
import type {
  PresenceEntry,
  RuntimeDriver,
  TicketEvent,
  TicketEventType,
  TicketListener,
} from "./types";

interface PresenceMember {
  lastSeenAt: number;
  expiresAt: number;
}

interface MemoryState {
  /** Rate limiter buckets. */
  buckets: Map<string, { count: number; resetAt: number }>;
  /** SSE fan-out registry, per ticket. */
  listeners: Map<string, Set<TicketListener>>;
  /** Presence: zone → (member → timestamps). */
  presence: Map<string, Map<string, PresenceMember>>;
}

const g = globalThis as unknown as { __ticketRuntimeMemory?: MemoryState };

function state(): MemoryState {
  if (!g.__ticketRuntimeMemory) {
    g.__ticketRuntimeMemory = {
      buckets: new Map(),
      listeners: new Map(),
      presence: new Map(),
    };
  }
  return g.__ticketRuntimeMemory;
}

// Rate limiter: fixed window, bounded map (same eviction policy as the
// original src/lib/rateLimit.ts implementation).
const MAX_BUCKETS = 10_000;

function checkRateMemory(key: string, limit: number, windowMs: number): Promise<boolean> {
  const now = Date.now();
  const { buckets } = state();
  if (buckets.size > MAX_BUCKETS / 2) {
    for (const [k, entry] of buckets) {
      if (now > entry.resetAt) buckets.delete(k);
    }
  }
  if (buckets.size >= MAX_BUCKETS) buckets.clear();

  const entry = buckets.get(key);
  if (!entry || now > entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return Promise.resolve(false);
  }
  entry.count += 1;
  return Promise.resolve(entry.count > limit);
}

// Event bus: per-ticket listener sets (same registry shape as the original
// src/lib/events.ts implementation).

function publishMemory(ticketId: string, type: TicketEventType): void {
  const set = state().listeners.get(ticketId);
  if (!set || set.size === 0) return;
  const event: TicketEvent = { type, at: new Date().toISOString() };
  for (const fn of set) {
    try {
      fn(event);
    } catch {
      // A broken stream must never break the request that published.
    }
  }
}

function subscribeMemory(ticketId: string, listener: TicketListener): () => void {
  const { listeners } = state();
  let set = listeners.get(ticketId);
  if (!set) {
    set = new Set();
    listeners.set(ticketId, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) listeners.delete(ticketId);
  };
}

// Presence: lazy-expiry per member — no cleanup timers needed.

const DEFAULT_PRESENCE_TTL_MS = 30_000;

function prunePresence(zone: string, now: number): void {
  const zoneMap = state().presence.get(zone);
  if (!zoneMap) return;
  for (const [member, entry] of zoneMap) {
    if (entry.expiresAt <= now) zoneMap.delete(member);
  }
  if (zoneMap.size === 0) state().presence.delete(zone);
}

async function touchMemory(zone: string, id: string, ttlMs?: number): Promise<void> {
  const ttl = ttlMs ?? DEFAULT_PRESENCE_TTL_MS;
  const now = Date.now();
  prunePresence(zone, now);
  const { presence } = state();
  let zoneMap = presence.get(zone);
  if (!zoneMap) {
    zoneMap = new Map();
    presence.set(zone, zoneMap);
  }
  zoneMap.set(id, { lastSeenAt: now, expiresAt: now + ttl });
}

async function listMemory(zone: string): Promise<PresenceEntry[]> {
  const now = Date.now();
  prunePresence(zone, now);
  const zoneMap = state().presence.get(zone);
  if (!zoneMap) return [];
  return [...zoneMap.entries()]
    .map(([id, entry]) => ({ id, lastSeenAt: entry.lastSeenAt }))
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

export function createMemoryRuntime(): RuntimeDriver {
  return {
    name: "memory",
    checkRate: checkRateMemory,
    publish: publishMemory,
    subscribe: subscribeMemory,
    touch: touchMemory,
    list: listMemory,
  };
}
