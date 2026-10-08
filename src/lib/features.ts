/**
 * Product feature switches.
 *
 * TRANSFERS — inter-department ticket transfers ("Send to team"). Core
 * decision: a ticket is NOT transferable between teams, so the feature is
 * DORMANT. Every UI entry point (Send to team button, transfer dialog,
 * approve/reject panels, deny actions, incoming-transfers inbox, "Sent" tab)
 * is hidden while this is false.
 *
 * The server-side logic and APIs (POST/PATCH /api/tickets/[id]/transfer,
 * /api/transfers/pending, /api/tickets/transfer-targets, the transfer schema
 * and helpers in lib/transfer.ts) remain fully functional and tested
 * (scripts/transfer-smoke.js) so the feature can be re-activated later by
 * flipping this single flag to true.
 */
export const TRANSFERS_ENABLED = false;
