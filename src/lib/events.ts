/**
 * Stable import paths for the ticket event bus (SSE fan-out).
 *
 * The implementation moved into the runtime core (src/lib/runtime) so the
 * in-memory bus, the rate limiter, and presence share one swappable driver
 * layer (RUNTIME_DRIVER=memory|redis). Signatures are unchanged — publish
 * stays fire-and-forget and subscribe stays synchronous.
 */
export {
  publishTicketEvent,
  subscribeTicket,
  type TicketEvent,
  type TicketEventType,
  type TicketListener,
} from "./runtime";
