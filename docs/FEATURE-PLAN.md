# TicketFlow — Feature Plan & Roadmap

Proposal for the next development cycles. Grounded in the current stack (Next.js 16 App Router, React 19, MongoDB/Mongoose, NextAuth v5, Tailwind 4, shadcn/Radix) and the existing architecture (see `docs/WORKFLOW.md`).

**Status legend:** 🟢 ready to build · 🟡 needs a decision first · 🔴 needs new infra

---

## 0. Guiding principles

1. **Reuse before adding.** Chat builds on the existing `Comment` model + `canAccessTicket` authz + notification pipeline — not a parallel messaging system.
2. **Ship value in vertical slices.** Each phase is independently shippable and demoable.
3. **No new infra in early phases.** Polling/SSE run inside the current Next.js server; Redis/WebSockets only when a real constraint appears (mirrors the existing rate-limiter tradeoff).
4. **Same three authorization layers everywhere.** Any new endpoint gets `requireApiRole` + `canAccessTicket`-style per-document checks from day one.

---

## 1. 🟢 Per-ticket client chat panel (flagship)

"Each ticket will have a unique chat" — a real-time conversation thread embedded in the ticket detail page, where the client and staff talk in place of (and on top of) the current comment list.

### 1.1 Data model (small, additive migration)

```
Comment (existing — becomes the chat message store)
  + visibility: "public" | "internal"     (default "public"; clients never see internal)
  + kind: "message" | "system"            (system = status changes, assignments → unified timeline)
  + editedAt?: Date                       (PATCH already exists — surface it)

TicketReadState (new collection — powers unread badges everywhere)
  { userId, ticketId, lastReadAt }  unique index (userId, ticketId)
```

Why not a new `Message` model: `Comment` already has `ticketId, authorId, body, attachment, createdAt`, an index on `{ticketId, createdAt}`, and CRUD endpoints + tests. One timeline keeps the API, notifications, and audit story simple.

### 1.2 Real-time transport — decision point 🟡

| Option | Effort | Multi-instance | Verdict |
|---|---|---|---|
| A. Short polling (5–10s, cursor-based `?after=<id>`) | S | ✅ | **Phase 1** — zero infra, good enough to ship |
| B. SSE per ticket (`GET /api/tickets/[id]/stream`) | M | ❌ per-process → Redis pub/sub later | **Phase 2** — right default for Next.js |
| C. WebSocket (custom server / socket.io) | L | ❌ needs server changes | Skip — fights App Router |
| D. Hosted realtime (Pusher/Ably/Supabase) | M | ✅ | Keep as escape hatch; adds vendor + cost |

**Recommendation:** A then B, behind a `NEXT_PUBLIC_CHAT_MODE=poll|sse` flag. An in-process `EventEmitter` hub for B now; swap in Redis pub/sub only when deploying multi-instance (same caveat as the existing rate limiter).

### 1.3 API surface

```
GET  /api/tickets/[id]/messages?after=<cursor>&limit=50   → history (cursor paginated, sorted asc)
POST /api/tickets/[id]/messages                            → send (rate-limited; reuses attachment validation)
GET  /api/tickets/[id]/stream?lastEventId=...              → SSE (Phase 2; Node runtime; authz on connect AND per event)
POST /api/tickets/[id]/typing                              → ephemeral, in-memory, never persisted (Phase 2)
PATCH /api/tickets/[id]/read                               → upsert TicketReadState (drives unread badges)
```

Authorization: every route = `requireApiRole(all four roles)` → `canAccessTicket(...)` → messages filtered by `visibility` (clients get public only, enforced in the query, not post-filtering).

### 1.4 UI

- **Split ticket detail:** left = `ConversationPanel` (the chat), right = resizable meta sidebar (reuses installed `react-resizable-panels`).
- **`ConversationPanel`:** grouped by day, avatar + name + role chip, optimistic send with ✓/✕ delivery states, "edited" marker, system events rendered as centered dividers ("Priya changed status → in_progress"), internal-note toggle for staff (amber styling), attachment chips (reuse existing magic-byte upload), date jump, "new messages ↓" pill.
- **Composer:** textarea (Enter to send, Shift+Enter newline), attachment button, internal-note switch, char counter; disabled state if `canTransitionStatus`-style rules forbid client posting on closed tickets (configurable: allow reopen-chat).
- **Typing indicator + read receipts** (Phase 2): "Alex is typing…", double-check marks via `TicketReadState`.
- **Unread badges:** ticket lists + sidebar queue count via `TicketReadState`; bell notifications keep working (dedupe: don't notify for your own message, throttle per ticket).
- **Client portal:** same `ConversationPanel` mounted at `/client/tickets/[id]` — clients see the identical thread minus internal notes and staff-only controls.

### 1.5 Phases

| Phase | Scope | Effort | Ships |
|---|---|---|---|
| **C1 — Chat MVP** | messages API + polling + ConversationPanel + composer + visibility filter + read-state upsert | M | Clients & staff chat in-ticket; internal notes work |
| **C2 — Live feel** | SSE stream + typing indicator + read receipts + unread badges + notification dedupe | M | Real-time without refresh |
| **C3 — Rich content** | multi-attachment, image paste/preview, emoji picker, edit/delete-with-tombstone, slash-commands (`/status resolved`) | S–M | Modern chat UX |
| **C4 — Scale-out** | Redis pub/sub behind the SSE hub, backpressure, message search | L | Multi-instance production |

Acceptance (C1): two browsers (client + agent) exchange messages ≤10s latency; client never receives internal notes (regression-tested); `npm test` extended with visibility + read-state matrix; `api-smoke.js` gets a chat section.

---

## 2. 🟢 UI enhancements (independent of chat)

Sorted by value ÷ effort. Several come free — the deps are **already installed** and unused or underused.

| # | Enhancement | Notes | Effort |
|---|---|---|---|
| U1 | **Command palette** (`⌘K`) — jump to ticket/user/page, run actions | `cmdk` already in package.json; add `POST /api/search` | S |
| U2 | **Ticket detail tabs** — Conversation · Activity · Attachments · Meta | Prereq for chat split view; `@radix-ui/react-tabs` installed | S |
| U3 | **Notification drawer** — slide-over bell panel with mark-read, filter by type | `vaul` (drawer) installed; notifications API exists | S |
| U4 | **Dark mode audit** — next-themes is wired; fix hardcoded colors found in tickets/routing components | | S |
| U5 | **Kanban board** — drag tickets between status columns per dept | `@dnd-kit` new dep OR simple HTML5 DnD first; reuses PATCH status + `canTransitionStatus` | M |
| U6 | **Saved filters & views** — persist per-user ticket filters (new `SavedView` collection, star in list header) | | M |
| U7 | **Bulk actions** — multi-select tickets → assign/status/close (batch endpoint with per-document authz loop) | | M |
| U8 | **Skeletons + empty states pass** — consistent shimmer loaders (pattern already used in UsersContent), friendly empties with CTAs | | S |
| U9 | **Analytics upgrade** — dept filter, date-range picker, export CSV | `recharts` installed | M |
| U10 | **Mobile pass** — bottom nav for client portal, responsive ticket detail (chat full-screen with sticky composer) | | M |
| U11 | **A11y audit** — focus traps in dialogs, aria-live for toasts/chat new messages, keyboard nav for RuleBuilder | axe-core in CI | M |

**Suggested order:** U2 → U1 → U3 (quick wins, all prepped by installed deps) → U4/U8 polish → U5/U6/U7 → U9–U11.

---

## 3. 🟡 Decisions needed before building

1. **Chat transport** (§1.2): accept poll→SSE recommendation, or go hosted realtime from day one?
2. **Internal notes:** should clients ever know internal notes exist ("staff discussed this") or be completely invisible? (Plan assumes invisible.)
3. **Chat on closed tickets:** read-only, or allow conversation until "closed" only?
4. **Kanban DnD library:** tiny hand-rolled vs `@dnd-kit` dependency.

---

## 4. 🔴 Later / bigger bets (parking lot)

| Idea | Why it's parked |
|---|---|
| SLA timers + breach alerts + escalation rules | needs policy definition first; touches routing engine |
| Canned responses / macros for agents | cheap after chat ships (composer integration) |
| CSAT survey on ticket close | needs product sign-off on scoring display |
| Knowledge base / suggested articles while composing | big content model |
| Email-to-ticket ingestion (inbound parse) | requires inbound-mail service + spam handling |
| Webhooks + public API tokens | needs token auth design separate from NextAuth sessions |
| Audit log viewer (who changed what) | data exists via middleware hooks; UI + retention policy needed |
| 2FA (TOTP) | NextAuth v5 beta TOTP support still moving |
| AI reply suggestions | separate evaluation; keep out of critical path |

---

## 5. Cross-cutting work required by the above

- **Migrations:** additive-only (`visibility`, `kind` default server-side on write; no backfill needed — old comments read as `public/message`). `TicketReadState` created lazily on first read.
- **Rate limiting:** extend `proxy.ts` pattern to `POST /api/tickets/[id]/messages` (e.g. 30/min/user) — spam ceiling for the chat.
- **Testing:** every phase adds to the tsx regression style (`scripts/chat-audit-test.ts`: visibility matrix, cursor pagination, read-state math) + `api-smoke.js` sections; SSE gets an integration script with curl/EventSource.
- **Perf:** cursor pagination everywhere (`?after=` on `_id`), `ConversationPanel` windowed at >200 messages, SSE heartbeat every 25s to survive proxies.
- **Feature flags:** `NEXT_PUBLIC_CHAT_MODE`, `CHAT_INTERNAL_NOTES=true|false` — lets the client portal ship before staff-side rollout if desired.

## 6. Suggested cycle order

1. **Cycle 1:** C1 chat MVP + U2 tabs + U8 skeletons (one coherent "ticket detail 2.0" release)
2. **Cycle 2:** C2 real-time + U1 palette + U3 notification drawer + U4 dark audit
3. **Cycle 3:** U5 kanban + U7 bulk actions + U6 saved views
4. **Cycle 4:** C3 rich chat + U9 analytics + U10/U11 hardening; revisit parking lot
