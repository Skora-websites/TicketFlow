# TicketFlow — Core Logic (Plain Language)

> A living summary of how the ticketing system works as built. Update this
> document whenever the rules below change.

## The People (Roles)

- **Superadmin** — oversees everything. Sees all tickets org-wide, manages
  users, departments, categories. But does **not** drive day-to-day work:
  cannot change ticket status or priority (except on tickets they sent
  themselves), cannot approve/deny transfers, cannot post in conversations.
- **Manager** — runs one department. Sees all of their department's tickets,
  assigns work, moves statuses, receives tickets from other departments, and
  is the only one who can add **agents** (to their own department).
- **Agent (team)** — does the work. What they can see depends on what their
  manager gave them at creation: **all department tickets** (default) or
  **only tickets assigned to them**.
- **Client** — files tickets and sees only their own. They never see
  priorities, internal notes, or routing details.

## A Ticket's Life

1. **Created** — by a client (via portal) or staff. The creator is the
   **sender of record**.
2. **Auto-routed** — a rules engine matches keywords/categories/priority and
   assigns the best-scoring available agent (skills, workload, working
   hours). If nothing matches, it sits unassigned for a manager.
3. **Worked** — the assigned agent moves it through statuses:
   `open → in_progress → on_hold → resolved → closed`.
4. **Maybe transferred** — **(currently dormant)** if it belongs to another
   department, staff send it there. The receiving **manager** must approve or
   deny it. Once denied, it goes back to the sender's department. Core product
   rule: **a ticket is non-transferable between teams**, so the transfer UI is
   switched off (`TRANSFERS_ENABLED = false` in `src/lib/features.ts`); the
   logic/APIs stay intact for a future re-activation.
5. **Closed** — conversation freezes; clients can reopen their own.

## The Rules

### Priority
Chosen by the *sender of record*, forever.
- Regular ticket → only the person who filed it.
- Transferred ticket → only the person who dispatched it (the receiver can
  read it, never change it — shown with a locked badge in the UI).

### Status
Writable only by a **manager** or the **assigned agent** — verified end-to-end:
nobody else, not superadmin, not the agent who merely filed the ticket.
Transitions follow a fixed map (e.g. no jumping straight from open to closed).

### Chat (conversation panel)
Exactly three parties can write:
1. the **sender of record** (filer, or the dispatcher on transfers),
2. the **department's manager** (or the receiving manager during a transfer),
3. the **assigned agent**.

Everyone else — including superadmin — sees a read-only thread. Every message
renders as a **chat bubble** (yours on the right, everyone else's on the left
with name + avatar), WhatsApp-style: ✓ sent → ✓✓ grey delivered → ✓✓ blue
read. The thread updates **live** (server-sent events, no refresh needed).
System events (status changes, assignments, transfers) appear as centered
dividers in the conversation. When a ticket is **closed, the conversation
freezes** — nobody can post until it's reopened. Internal notes stay
staff-only. The panel header shows the participant roster (avatar + name + role).

### Transfers (UI dormant — see step 4 above)
Core product rule: **a ticket is non-transferable to another team.** The
transfer feature is dormant — no UI surface can create or decide a transfer —
while the logic and APIs remain live behind the flag. When re-activated,
this is how it works: superadmins dispatch **to a department's manager only** — they cannot address
an agent directly (the receiving manager assigns someone). Staff (agents and
managers) may address either. Decisions are settled **manager-to-manager**
(superadmin is never involved in the decision). A manager can **deny** an
incoming transfer — whether addressed to
them directly or to an agent in their department — with an **optional
reason**. The reason is stored on the ticket, shown to the sender in the
transfer panel, and included in their notification. Deny actions exist in all
manager workspaces: overview inbox, ticket list, unassigned queue, and ticket
detail panel.

### Adding users
- **Manager → agents**, own department only.
- **Superadmin → managers** (department required) **and agents** (any
  department), and may set a **reporting manager** on the new user.
- At creation — and any time later via **Edit User** — the admin sets the
  agent's **ticket access**: whole department or assigned-only. Superadmin can
  also change a user's **reporting manager** when editing.
- **Username + password are emailed** to the new user. Blank password → the
  system generates a strong one. Without SMTP configured, dev mode surfaces
  credentials once; production always emails.

## Dashboards (Overview page, per role)

- **Superadmin** — Team Workload + Recent Tickets lead the grid, then Tickets
  by Status, then **Tickets by Department + Weekly Trend as a pair**, then
  Tickets by Priority. Stat cards: Open, In Progress, **Unassigned**, Total,
  Resolution Rate.
- **Manager** — same minus the department chart; Weekly Trend full-width.
  Unassigned counts their department's queue.
- **Agent** — personal only: Open, In Progress, **On Hold**, Total,
  Resolution Rate. No org-level charts; Recent Tickets sits in the grid.
  Skeleton loaders match each layout so nothing shifts while loading.

## Safety Rails

- Every permission is enforced **server-side**; the UI only hides what the
  API rejects.
- Ticket-list scoping can't be bypassed by crafted queries (IDOR protection).
- Rate limiting on auth endpoints and comment posts; bcrypt-hashed passwords;
  session-version bumps kill stolen sessions on password change; sessions
  revalidate against the DB every 60s.

## Where the Rules Live in Code

| Rule | File |
|---|---|
| Status permission + access matrix | `src/lib/authz.ts` |
| Priority sender-lock, chat participation, transfer helpers | `src/lib/transfer.ts` |
| Ticket list scoping | `src/app/api/tickets/route.ts` |
| Ticket update rules (status/priority) | `src/app/api/tickets/[id]/route.ts` |
| Transfer send/decide (+ rejection reason) | `src/app/api/tickets/[id]/transfer/route.ts` |
| Comment posting (participant rule) | `src/app/api/tickets/[id]/comments/route.ts` |
| User creation policy + credential email; editing ticketAccess / reporting manager | `src/app/api/users/route.ts`, `src/app/api/users/[id]/route.ts` |
| Credential + reset emails | `src/lib/mailer.ts` |
| Role-aware overview + skeletons | `src/app/dashboard/overview/OverviewContent.tsx` |

Regression suites: `npm test` (unit rules), plus live smoke scripts
(`scripts/api-smoke.js`, `scripts/transfer-smoke.js`,
`scripts/page-render-smoke.js`) against a running server.
