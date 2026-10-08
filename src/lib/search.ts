/**
 * Ticket search query builder (pure, client-safe).
 *
 * Replaces the per-keystroke `$regex`-inside-`$or` collection scan with a
 * `$text` query backed by the ONE text index on {title, description} (see
 * models.ts). Tradeoff, accepted deliberately: $text matches whole stemmed
 * tokens, not substrings — searching "netf" no longer finds "network".
 * Ticket numbers are exempt: an exact paste like "TK-1024" (or the bare
 * number) must always find its ticket, so it gets a bounded anchored regex
 * on the short, unique ticketNumber field instead.
 *
 * Mongo constraint encoded here: $text may only appear at the top level of
 * a query or inside $and — never inside $or. Callers therefore merge the
 * returned clause via $and (or spread it at top level) rather than nesting
 * it into a scope $or, which also guarantees the clause can never WIDEN a
 * role-scoped result set.
 */

// "TK-1024", "tk 1024", "TK1024", or a bare "1024". Longer digit runs are
// treated as normal search text, not ticket numbers.
const TICKET_NUMBER_RE = /^(tk[-\s]?\d{1,6}|\d{3,6})$/i;

export interface TicketSearchClause {
  $text?: { $search: string };
  ticketNumber?: { $regex: string; $options: string };
}

export function buildTicketSearchFilter(rawSearch: unknown, maxLength = 100): TicketSearchClause | null {
  if (typeof rawSearch !== "string") return null;
  const trimmed = rawSearch.trim().slice(0, maxLength);
  if (!trimmed) return null;

  // A pure ticket-number paste is a LOOKUP, not a text search: "TK-1024"/
  // "1024" must return that ticket even when title/description contain no
  // matching tokens. It cannot be expressed as $text OR number — Mongo
  // forbids $text inside $or — so the lookup bypasses $text entirely.
  // (A number AND-ed with $text would dead-match on token-free tickets —
  // the exact bug this branch exists to prevent.)
  const pureNumber = trimmed.match(TICKET_NUMBER_RE);
  if (pureNumber) {
    const digits = (pureNumber[0].match(/\d+/) as RegExpMatchArray)[0];
    return { ticketNumber: { $regex: `TK-?${digits}$`, $options: "i" } };
  }

  // $text gives quotes phrase-search meaning and a leading "-" term
  // negation. A pasted `"login" -fix` must not silently invert the query —
  // strip quotes, backslashes, and per-token leading hyphens.
  const textQuery = trimmed
    .replace(/["\\]/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/^-+/, ""))
    .filter(Boolean)
    .join(" ");
  if (!textQuery) return null;

  // Mixed input ("TK-0022 broken") searches text tokens; adding a
  // ticketNumber AND-branch here could only narrow, never rescue.
  return { $text: { $search: textQuery } };
}
