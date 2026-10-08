# TicketFlow

A full-stack, role-based helpdesk / ticketing system with an automatic ticket-routing engine.

**Stack:** Next.js 16 (App Router, webpack) · React 19 · TypeScript · MongoDB (Mongoose) · NextAuth v5 (Auth.js) · Tailwind CSS 4 · shadcn/Radix UI · Recharts · Zod

## What's inside

- **Auto-routing engine** — tickets are evaluated against ordered rules (keyword/category/priority/requester conditions) and assigned to the best-scoring agent based on skills, availability, working hours, live load, and round-robin tie-breaking. A dry-run simulator previews routing as staff type the ticket.
- **Role-based access control** — three layers: edge middleware (route protection, role redirects, auth rate limiting) → page guards (`requireRole`) → per-document API checks (`canAccessTicket`, `canTransitionStatus`). Roles: `super_admin`, `manager`, `team`, `client`.
- **Client portal** — separate surface at `/client` where clients see only their own tickets, reopen resolved ones, and get generic routing reassurance (rule/agent details are internal).
- **Dashboards** — overview, unassigned queue, workload, analytics (aggregated, not N+1), departments, users, notifications, routing rule builder.
- **Email** — optional SMTP. Password reset, signup verification, staff invites, and notification emails degrade gracefully; dev flows surface links via the API when SMTP is unconfigured (never in production).
- **Staff invites** — creating a user without a password (`POST /api/users`) emails a single-use, 7-day "set your own password" link (stored hashed like reset tokens; rotating on resend kills the old link). No generated password is ever returned in an HTTP response or shared manually; admins can still set a password explicitly for offline onboarding.

## Prerequisites

- Node.js ≥ 20.19
- MongoDB. Either:
  - the bundled binary + data dir on Windows: `.mongodb-binaries/mongod-*.exe` with `--dbpath .mongodb-data`, or
  - any local `mongod` listening on `127.0.0.1:27017`

## Setup

```bash
# 1. Environment
cp .env.example .env.local        # then fill in AUTH_SECRET etc.

# 2. Start MongoDB (bundled binary on Windows)
start "" /B .\.mongodb-binaries\mongod-x64-win32-6.0.14.exe --dbpath .mongodb-data --port 27017

# 3. Dependencies — see the warning below first!
npm install --legacy-peer-deps

# 4. Seed demo data (idempotent; never wipes existing rules)
npm run seed

# 5. Run
npm run dev                       # http://localhost:3000
```

### ⚠️ Package-manager hazard (read before installing)

`package.json` declares `"packageManager": "pnpm@9.15.0"`, **but**:

- The repo's committed `node_modules` was produced by **pnpm 11 on a different machine**; its internal junctions point at paths that don't exist elsewhere (`C:\Users\...`), which breaks Next with `MODULE_NOT_FOUND` and duplicate-React crashes.
- pnpm is often not installed on contributor machines (this project was originally run with none).

**Do not** run a package manager against a copied `node_modules`. Either delete it first or use a machine-local install:

```bash
rm -rf node_modules
npm install --legacy-peer-deps    # legacy flag: next-auth v5 beta peer-conflicts with nodemailer
```

If you prefer pnpm, `corepack enable && pnpm install` on a clean tree also works — just never mix managers on one `node_modules`.

## Demo accounts (after `npm run seed`)

All seeded users share one password: `wBDWlqZk9uLIA1!` (override with `SEED_DEMO_PASSWORD`).

| Role | Email |
|---|---|
| Super admin | `admin@ticketing.com` |
| Dev manager | `dev.manager@ticketing.com` |
| Dev agent | `dev1@ticketing.com` |
| Client portal | `client1@example.com` |

Seeds: 3 departments, 12 users, 15 tickets, comments, 6 routing rules, 9 availability records.

## Architecture notes

- **Routing engine** (`src/lib/routing/engine.ts`): `routeTicket()` evaluates active rules in priority order; `pickBestAgent()` scores candidates (skills ×10, availability, working-hours via `Intl` in each schedule's timezone, capacity headroom, load from a live aggregation). Rules carry match stats; the preview endpoint is a dry run.
- **Auth** (`src/lib/auth.ts`): JWT sessions re-validated against the DB on a 60s TTL. A `sessionVersion` bump kills sessions on password change instantly; role/department/active changes invalidate the TTL cache so they land on the next request.
- **Rate limiting** (`src/proxy.ts`): in-memory fixed window (15/min/IP) on `/api/auth/*`, keyed on the **rightmost** `X-Forwarded-For` entry. Per-process only — use Redis for multi-instance deployments.
- **Attachments**: inline BSON buffers, magic-byte validated, 4MB per file, up to 5 per ticket. Migrate to GridFS/object storage before the 16MB BSON ceiling matters.

## Testing

```bash
npm test          # typecheck + authz regression matrix + medium-fixes matrix
npm run lint
```

`scripts/authz-audit-test.ts` covers the `canAccessTicket` role matrix, regex-injection escaping, and magic-byte upload validation. `scripts/medium-fixes-test.ts` covers team-role self-request visibility. `scripts/invite-flow-test.ts` covers the invite token format, storage scheme, and TTL. `scripts/transfer-flow-test.ts` covers the inter-department transfer authz/priority-lock matrix.

Live end-to-end checks (server must be running):

```bash
node scripts/api-smoke.js http://localhost:3000       # full API matrix
node scripts/transfer-smoke.js http://localhost:3000  # transfer + categories + approval inbox
```

> ⚠️ `/api/auth/*` is rate-limited (15 req/min/IP) — wait ~65s between smoke runs.

## Agent handoff

Picking up this repo to change ticket/authz code? Read **[docs/HANDOFF.md](docs/HANDOFF.md)** first — it documents the inter-department transfer panel, dynamic categories, role-based views, the manager approval inbox, and the gotchas around each.

## Known limitations

- Sessions lag up to 60s for changes that don't hit the invalidation hooks (documented tradeoff).
- No formal unit-test framework (no vitest/jest yet) — regression scripts run via tsx.
- Email verification and password reset require SMTP in production; without it, dev-only fallbacks return the links via API responses.
