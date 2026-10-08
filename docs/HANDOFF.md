# TicketFlow — Agent Handoff Notes

> Written for the next agent picking up this repo. Shipped & verified through
> **2026-09-30**. Read this before changing ticket/authz/user code. For a
> plain-language summary of the system rules, see `docs/CORE-LOGIC.md`.

---

## 1. Environment & how to run

- **Stack:** Next.js 16 (App Router, webpack), React 19, TypeScript, MongoDB/Mongoose 9, NextAuth v5 (JWT sessions), Tailwind 4, shadcn/Radix, Zod, Recharts.
- **Package-manager hazard (READ FIRST):** `package.json` declares `pnpm@9.15.0`, but the committed `node_modules` came from pnpm 11 on another machine (broken junctions). **Never** run a package manager against a copied `node_modules`. Clean install:
  ```bash
  rm -rf node_modules && npm install --legacy-peer-deps
  ```
  (`--legacy-peer-deps` because next-auth v5 beta conflicts with nodemailer peers.)
- **MongoDB (Windows dev box):**
  ```bash
  nohup ./.mongodb-binaries/mongod-x64-win32-6.0.14.exe --dbpath .mongodb-data --port 27017 > mongodb-dev.log 2>&1 &
  ```
- **Seed (idempotent — never wipes user data or existing routing rules):** `npm run seed`
- **Run:** `nohup npm run dev > dev-server-current.log 2>&1 &` → http://localhost:3000
- **Env:** copy `.env.example` → `.env.local`, set `AUTH_SECRET` (+ optional `SMTP_*`; `MONGODB_URI` defaults to `mongodb://127.0.0.1:27017/ticketing`).

**Two recurring Windows dev hazards:**

1. **`.next` corruption while the dev server runs during edits** → symptoms: `UNKNOWN errno -4094`, random 500s. Fix: `taskkill //F //IM node.exe` (or kill the :3000 PIDs), `rm -rf .next`, restart. Do this before trusting any test run after schema changes.
2. **Mongoose strict mode silently drops unknown schema paths** — after adding a field to a schema, restart the dev server or writes will quietly lose the new field.

**Demo accounts** (seeded; shared password `wBDWlqZk9uLIA1!`, override with `SEED_DEMO_PASSWORD`):

| Role | Email |
|---|---|
| Super admin | `admin@ticketing.com` |
| Dev manager | `dev.manager@ticketing.com` |
| Dev agents | `dev1@ticketing.com`, `dev2@ticketing.com` |
| Marketing manager / agents | `marketing.manager@…`, `marketing1@…`, `marketing2@…` |
| Sales manager / agents | `sales.manager@…`, `sales1@…`, `sales2@…` |
| Client | `client1@example.com` |

**Live-test login pattern** (used by every smoke script): cookie-jar class → `GET /api/auth/csrf` → `POST /api/auth/callback/credentials` with `csrfToken`+`email`+`password` (form-encoded, `redirect:"manual"`) → `GET /api/auth/session` to confirm.

---

## 2. Testing (all green as of 2026-09-30)

```bash
npm test                                             # typecheck + 4 tsx suites, 80 assertions
npm run lint                                         # 0 errors
node scripts/api-smoke.js http://localhost:3000      # 55 checks, needs running server
node scripts/transfer-smoke.js http://localhost:3000 # 26 checks, needs running server
node scripts/page-render-smoke.js http://localhost:3000 # 6 dashboard pages render 200
node scripts/invite-smoke.js http://localhost:3000   # 24 checks: user-creation policy (credential email)
```

- All smoke scripts default to `http://localhost:3000`; the arg is optional.
- Regression suites (pure logic, no DB, `server-only` stubbed): `authz-audit-test.ts`, `medium-fixes-test.ts`, `chat-audit-test.ts`, `transfer-flow-test.ts`. (`invite-flow-test.ts` was removed 2026-09-30 with the invite-link flow.)
- **Gotcha:** `/api/auth/*` is rate-limited 15 req/min/IP. Login-heavy suites run back-to-back will 429 and crash each other. Sleep **~70s** between them (each logs in 4–5 sessions).
- **First-run flake:** right after a fresh dev-server start, the first request may hit `ECONNREFUSED` while routes compile (~6s). Retry once.
- `scripts/invite-smoke.js` was **rewritten 2026-09-30** into a credential-email user-creation smoke test (24 checks): the full who-may-create-whom matrix (403s), devCredentials fallback, login with the auto-generated password, assigned-scope ticket visibility, validation errors, self-cleanup. Kept the filename for git history.
- **Invite-link flow removed 2026-09-30.** Deleted: `/invite/[token]` page, `/api/auth/invite/[token]` route (now falls through to NextAuth's catch-all → 400 "Bad request."), resend-invite POST `/api/users/[id]` (now 405), `src/lib/invites.ts`, `sendInviteEmail` in mailer, `scripts/invite-flow-test.ts`. `User.inviteToken`/`inviteExpires` stay in the schema (marked legacy) so old rows still load. Accounts are created exclusively via credential email; if a user's email bounced, set them a new password via PATCH (which emails... actually it doesn't email — admin reads the new password to the user) or delete + recreate.
- `scripts/migrate-categories.js` — one-off migration for pre-existing DBs (legacy `bug/feature/support` → new dynamic categories). Idempotent.

---

## 3. Core rules (who can do what)

The enforcement lives in two files; **keep the split in mind**:

- `src/lib/authz.ts` — **imports `server-only`** → usable only in route handlers/server code.
- `src/lib/transfer.ts` — **pure, client-safe** → the UI imports rules from here.

| Rule | Enforcer | Summary |
|---|---|---|
| Ticket visibility | `canAccessTicket(role, userId, requesterId, assigneeId, deptId, userDeptId, transfer, userTicketAccess)` in `authz.ts` — now **8 params**. Client components can't call it; they get the decision via API responses. | Same dept, or requester/assignee, or pending-transfer receiving manager. `userTicketAccess:"assigned"` narrows team members to own+filed tickets. |
| Status changes | `canTransitionStatus(role, status, newStatus, isOwner, isAssignee)` in `authz.ts` | Manager or assigned agent only — **not** superadmin, not the agent who merely filed it. Fixed transition map (no open→closed jumps). |
| Priority | `canSetPriority(user, ticket, transfer)` + `isPriorityLockedFor(user, transfer)` in `transfer.ts` | **Sender of record only, forever.** On transfers the sender's POST overwrites `ticket.priority` and it locks for the receiver (403 + locked badge). |
| Chat participation | `isConversationParticipant(user, ticket, transfer)` in `transfer.ts` | Sender of record, department (or receiving) manager, assigned agent — plus superadmin, who can read and post in every conversation. Managers of other departments are read-only. |
| Transfer decision | `canDecideTransfer(user, transfer)` in `transfer.ts` | Receiving manager only. Manager-to-manager; superadmin never decides. |

**If you add a ticket-scoped endpoint:** call `canAccessTicket` and pass **both** `ticket.transfer` and `user.ticketAccess` — every existing call site (tickets GET/PATCH/DELETE, comments GET/POST/PATCH/DELETE, read-state, transfer, attachments GET/DELETE) does. `transfer-flow-test.ts` covers the visibility matrix.

Chat roster: `GET /api/tickets/[id]` builds a `chatParticipants` array (id/name/role/kind; filer superseded by dispatcher on transfers) which `ConversationPanel` renders as avatar+name+role.

---

## 4. User-creation policy (shipped 2026-09-30)

`POST /api/users` (`src/app/api/users/route.ts`) enforces:

| Actor | Can create | Constraints |
|---|---|---|
| Manager (`role:"manager"`) | `team` only | Own department only; sets `ticketAccess` (`"department"` default \| `"assigned"`) |
| Super admin | `manager` or `team` | Manager: **department required** (+ optional `reportingManagerId`); agent: any department, optional `reportingManagerId`, optional `ticketAccess` |
| Agent / client | — | 403 |

- **Credentials are emailed** (`sendCredentialEmail` in `src/lib/mailer.ts`): username + password. Blank password → `generatePassword()` (3 words + 3 digits, `randomBytes`). SMTP-unconfigured dev fallback returns `devCredentials` in the response (toast in UI) — **dev-only, never in prod**.
- **`ticketAccess` plumbs through the session**: `src/lib/db/models.ts` (`TicketAccess` type, `IUser.ticketAccess` default `"department"`, `reportingManagerId` ref) → `src/lib/auth.ts` JWT + session (3 spots) → `src/types/next-auth.d.ts` → `src/app/api/tickets/route.ts` team scope (`view=all` for `"department"`-scoped agents only) → 8th param of `canAccessTicket` everywhere.
- UI: `src/app/dashboard/users/UsersContent.tsx` — role-aware dropdown, ticketAccess select for team role, reporting-manager select for superadmin, devCredentials toast. Form type is `z.input<typeof userFormSchema>` (pre-default) so the controlled select can be empty.
- **Deferred:** the **edit** dialog doesn't expose `ticketAccess`/`reportingManagerId` editing; `PATCH /api/users/[id]` is untouched.

## 5. Unassigned stat card (shipped 2026-09-30)

`src/app/dashboard/overview/OverviewContent.tsx`: `StatCard "Unassigned"` sits between In Progress and the On Hold card, rendered **only for managerial roles** (`isManagerial`). Agents get On Hold instead (their `overview.unassigned` counts only their own tickets — always 0). Trend: "Needs attention" (bad) when > 5, else "Under control" (good). Grid is `sm:grid-cols-2 lg:grid-cols-5` for all roles; skeletons match.

`GET /api/stats` → `overview.unassigned` scope: **superadmin** = org-wide, **manager** = dept + pending incoming transfers, **agent** = own tickets. The sidebar queue pill (`src/components/layout/sidebar.tsx`) reuses the same field for managers.

---

## 6. Inter-department transfers (shipped 2026-09-28, **UI DORMANT since 2026-10-01**)

> **Product decision (2026-10-01): a ticket is non-transferable between teams.**
> The entire transfer UI is hidden behind `TRANSFERS_ENABLED = false` in
> `src/lib/features.ts` — Send-to-team button, transfer dialog, approve/reject
> panel, deny actions (ticket list + queue), incoming-transfers inbox, and the
> "Sent" tab. The APIs, schema, helpers and tests below remain fully functional
> so the feature can be re-activated by flipping that single flag.

- Embedded `transfer` subdoc on Ticket: `{ fromId, toDepartmentId, toUserId?, toManagerId, direction, priority, status: pending|approved|rejected, approvedBy?, approvedAt?, rejectedBy?, rejectedAt?, sentAt, readAt?, note? }`. One transfer per ticket (409 on re-send while one exists). Notification types `transfer_sent|approved|rejected` — **enum exists twice** (type union + schema enum), update both.
- **Send:** `POST /api/tickets/[id]/transfer` (sender: team/manager/super_admin) — picks target dept + recipient + **priority** + note. `direction:"agent"` keeps the ticket hidden from the target agent until approval; `direction:"manager"` lands it unassigned in the receiving dept. **Superadmin may only use `direction:"manager"`** — agent-directed transfers are staff-only (403 otherwise; TransferDialog hides the agent option via the `senderRole` prop).
- **Decide:** `PATCH …/transfer {action:"approve"|"reject"}` — receiving manager only (`canDecideTransfer`). Reject is terminal; `rejectionReason` is stored. Sender tracks via `view=sent`.
- **Auto-approve on assignment:** PATCHing `assigneeId` on a pending-transfer ticket marks it approved (approver = assigner).
- API: `GET /api/tickets/transfer-targets` (other depts + members), `GET /api/transfers/pending` (manager inbox; sets `transfer.readAt`).

---

## 7. Categories, views, chat transport

- **Dynamic categories:** `Category` model, slug-validated at ticket create/patch (400 "Unknown category"), super-admin CRUD at `/api/categories` + `/dashboard/categories` (DELETE 409 while referenced). Defaults: marketing, development, sales, other. Legacy `bug/feature/support` migrated by seed + `scripts/migrate-categories.js`. **Gotcha:** seed skips routing rules when any exist — old DBs need the migration script or rules matching `category:"bug"` silently stop firing.
- **Ticket views:** `GET /api/tickets?view=all|mine|unassigned|sent`. Agents: My + Sent only. Manager default scope = dept **OR** pending incoming transfers — any new filter must merge into that `$or`/`$and` structure, never overwrite it (IDOR guard).
- **Chat transport:** **SSE live (built 2026-10-01) + polling safety net.** `GET /api/tickets/[id]/events` streams `comments`/`read`/`open` frames per ticket — access-checked via `canAccessTicket` BEFORE the stream opens, heartbeat every 25s, auto-reconnect via `retry:`. Pub/sub is `src/lib/events.ts` (in-process, `globalThis`-cached for HMR; swap for Redis pub/sub in multi-instance deploys). Publish points: comment POST, ticket PATCH (status/assign), transfer POST/PATCH. `TicketDetailClient` owns one `EventSource` per ticket (merges frames into comment state, dedupes, bumps `liveEventCount`); the adaptive delta poll (2.5s active / 10s idle / paused hidden) remains as a reconnect-gap safety net. `ConversationPanel` renders WhatsApp-style bubbles for ALL users — own messages right with receipts (✓ sent, ✓✓ grey delivered via `Comment.deliveredAt`, ✓✓ blue read via TicketReadState max-of-others), everyone else left with avatar+name; 15-min edit window; closed tickets freeze the thread (composer → notice).

---

## 8. Architecture map

| Concern | File |
|---|---|
| Models: Ticket transfer subdoc, Category, User `ticketAccess`/`reportingManagerId`, notification types | `src/lib/db/models.ts` |
| Client-safe rules: priority lock, chat participants, transfer decide | `src/lib/transfer.ts` |
| Server-only authz: `canAccessTicket` (8 params), `canTransitionStatus` | `src/lib/authz.ts` |
| Session plumbing incl. `ticketAccess` (3 spots) | `src/lib/auth.ts`, `src/types/next-auth.d.ts` |
| User creation policy, `generatePassword`, `devCredentials`; PATCH also accepts `ticketAccess` + `reportingManagerId` (same guards as creation, `null` clears reporting manager) | `src/app/api/users/route.ts`, `src/app/api/users/[id]/route.ts` |
| Credential email, `isSmtpConfigured` | `src/lib/mailer.ts` |
| Ticket list scoping (views, `ticketAccess`, `$or`/`$and`) | `src/app/api/tickets/route.ts` |
| Ticket detail + `chatParticipants` roster + priority lock + auto-approve | `src/app/api/tickets/[id]/route.ts` |
| Transfer send/decide, directory, pending inbox | `src/app/api/tickets/[id]/transfer/route.ts`, `…/transfer-targets/route.ts`, `src/app/api/transfers/pending/route.ts` |
| Stats (unassigned scoping) | `src/app/api/stats/route.ts` |
| Overview grid + Unassigned card gating | `src/app/dashboard/overview/OverviewContent.tsx` |
| Manager approval inbox card | `src/app/dashboard/overview/IncomingTransfersCard.tsx` |
| Add-user form gating | `src/app/dashboard/users/UsersContent.tsx` |
| Chat live: event bus + SSE | `src/lib/events.ts`, `src/app/api/tickets/[id]/events/route.ts` |
| Chat UI (bubbles + receipts) | `src/components/tickets/ConversationPanel.tsx` |
| Collision detection: presence touch+list API (staff-only, 30s TTL) + "X is viewing" chip in ticket header | `src/app/api/tickets/[id]/presence/route.ts`, `src/components/tickets/ViewersChip.tsx` |
| Attachment storage: GridFS store (streaming, orphan-safe deletes, dual-read legacy) + idempotent backfill | `src/lib/attachments-store.ts`, `scripts/backfill-attachments.ts` (`npm run attachments:backfill [-- --strip]`) |
| Full-text ticket search: $text builder (pure) + text index {title, description} | `src/lib/search.ts`, text index in `src/lib/db/models.ts` |
| Chat client (EventSource + poll fallback) | `src/app/dashboard/tickets/[id]/TicketDetailClient.tsx` |
| Transfer UI | `src/components/tickets/TransferDialog.tsx`, `TransferPanel.tsx` |
| Sidebar role filter + queue pill | `src/components/layout/sidebar.tsx` |
| Middleware matcher | `src/proxy.ts` |

---

## 9. Decisions & gotchas worth knowing

1. **Transfer priority IS ticket priority** — the send POST overwrites `ticket.priority`; the lock is enforced only in PATCH + UI. Direct DB writes bypass it by design.
2. **`readAt` is set by the inbox GET**, not ticket-detail reads.
3. **One transfer per ticket, ever** — no API to clear a rejected subdoc. **Superadmin transfers are manager-directed only** (enforced in the POST handler + UI). **All ticket events (status/assign/transfer sent+approved/rejected) also write `kind:"system"` comments** so the chat shows the full story; a same-assignee PATCH is deliberately a no-op (no event).
4. **Manager `$or` scoping** — merge new filters into it; overwriting is an IDOR hole.
5. **Notification enum exists twice** (type union + schema enum).
6. **Auth rate limit** 15/min on `/api/auth/*` — sleep ~70s between login-heavy suites; smoke scripts crash (not just fail) when logins 429.
7. **Seed is append-only**; category migration for old DBs is a separate script.
8. **Runtime core** (`src/lib/runtime`): the in-memory rate limiter, the SSE event bus, and presence (collision detection) share ONE swappable driver layer — memory (default) or Redis (`RUNTIME_DRIVER=redis` + `REDIS_URL`; `ioredis` is an optional dep, loaded lazily, fail-open to memory if it can't load). `checkRate` is now **async** (`await checkRate(...)` — needed for Redis); `publishTicketEvent`/`subscribeTicket` keep their sync signatures. Legacy paths `@/lib/rateLimit` and `@/lib/events` are shims over the core. The proxy auth limiter (item 6) stays in middleware by design (edge runtime).
9. Sessions re-validate against DB on a 60s TTL; role/dept changes call `invalidatePermissionsCheck()` — do the same if you change session-relevant fields programmatically.
10. **`server-only` split:** UI needs a rule? It must live in `transfer.ts` (pure). Putting it in `authz.ts` breaks client imports.
11. **Windows:** bash (Git Bash) syntax only, `nohup … &` for background procs, `taskkill //F //PID …`; restart the dev server after schema changes (strict-mode silent drops) and after heavy edits (`.next` corruption).
12. Git: everything through the GridFS attachment migration is committed — `19ae730` (superadmin chat + polish), `78622a4` (dormant transfer UI), `d0d57fc` (runtime core), `c24be2a` (presence + ViewersChip), then the attachments commit. Commit before starting a new feature stream — this repo's history is the session log.
13. **Attachments live in GridFS, not in docs** (since 2026-10-03): `attachments.files`/`attachments.chunks` in the SAME database — `mongodump` covers them, no separate backup store. Write order is file-FIRST, doc-second (crash ⇒ orphan file, never dangling fileId); every delete path (attachment DELETE, comment DELETE, ticket DELETE cascade) frees the stored file. New rows carry `fileId` + never `data`; legacy rows with inline `data` are dual-read until backfilled (`npm run attachments:backfill`, then `-- --strip`). Changing `models.ts` schemas still requires a dev-server restart (strict-mode silent drops).
14. **Ticket search is $text, not $regex** (since 2026-10-03): token-stemmed via the ONE text index ({title, description}) — substring fragments ("netf" for "network") no longer match, by design. A pure ticket-number paste ("TK-1024", "1024") becomes an exact `ticketNumber` lookup that bypasses $text entirely — AND-ing a number with $text dead-matches token-free tickets (Mongo forbids $text inside $or, so OR-rescue is impossible). The builder (`buildTicketSearchFilter`) strips quotes/backslashes/leading hyphens so pasted strings can't trigger phrase or negation semantics.
