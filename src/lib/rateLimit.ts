/**
 * Stable import path for the fixed-window rate limiter.
 *
 * The implementation moved into the runtime core (src/lib/runtime) so the
 * in-memory limiter, the SSE event bus, and presence share one swappable
 * driver layer (RUNTIME_DRIVER=memory|redis). `checkRate` is now async —
 * shared-store drivers (Redis) need it — so callers must `await`.
 */
export { checkRate } from "./runtime";
