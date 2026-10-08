/**
 * Runtime core — driver contracts.
 *
 * Everything here is scoped PER PROCESS when backed by memory. The runtime
 * (src/lib/runtime/index.ts) selects a driver via RUNTIME_DRIVER so a
 * multi-instance deployment swaps all three subsystems at once:
 *
 *   1. RateLimiter  — fixed-window action throttling (e.g. conversation posts)
 *   2. EventBus     — ticket change fan-out to SSE streams
 *   3. Presence     — ephemeral "who is looking at X" (collision detection)
 *
 * Drivers must treat failures as best-effort: an unavailable backend degrades
 * (log + continue), it must never break the request that uses it.
 */

export type TicketEventType = "comment" | "ticket" | "read";

export interface TicketEvent {
  type: TicketEventType;
  /** ISO time of the event (informational; clients refetch, not merge). */
  at: string;
}

export type TicketListener = (event: TicketEvent) => void;

export interface RateLimiterDriver {
  /**
   * Fixed-window limiter. Returns true when the call is OVER the limit
   * (i.e. should be rejected). Async so shared-store drivers (Redis) fit the
   * same contract as the in-memory one.
   */
  checkRate(key: string, limit: number, windowMs: number): Promise<boolean>;
}

export interface EventBusDriver {
  /** Notify everyone watching a ticket. Fire-and-forget; listener errors are swallowed. */
  publish(ticketId: string, type: TicketEventType): void;
  /** Watch a ticket; returns an unsubscribe function (sync — listeners attach immediately). */
  subscribe(ticketId: string, listener: TicketListener): () => void;
}

export interface PresenceEntry {
  id: string;
  lastSeenAt: number;
}

export interface PresenceDriver {
  /** Mark `id` as present in `zone` for ttlMs (default 30s), e.g. zone="ticket:<id>". */
  touch(zone: string, id: string, ttlMs?: number): Promise<void>;
  /** Live members of the zone (expired entries pruned). */
  list(zone: string): Promise<PresenceEntry[]>;
}

export interface RuntimeDriver extends RateLimiterDriver, EventBusDriver, PresenceDriver {
  readonly name: "memory" | "redis";
  /** Best-effort shutdown (used by tests/graceful restarts). */
  close?(): Promise<void>;
}
