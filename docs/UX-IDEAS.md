# TicketFlow — UX Ideas (researched from leading ticketing systems)

Companion to `docs/FEATURE-PLAN.md`. This documents **what the best-in-class tools do**, the patterns worth stealing, and how each maps onto TicketFlow's existing stack. Items marked ⭐ are new ideas beyond the original feature plan.

---

## 1. How the famous systems are structured

### Zendesk — Agent Workspace (structured ops at scale)
- **Three-pane layout:** ticket list ⇄ conversation ⇄ ticket context sidebar (requester history, SLA, properties, apps).
- **Omnichannel inbox** with per-channel views, **macro** buttons in the composer, **SLA + satisfaction** predictions right in the header, keyboard shortcuts throughout.
- **Steal:** split-view with context sidebar, macros (canned replies), SLA visibility, shortcut layer.

### Intercom — Messenger-first, conversation-centric
- **Inbox = conversations, not records.** Unified timeline merges emails/chat/posts.
- **Composer with saved replies**, snippets, **Cyclades-style Resolution prompts**; **outbound** (help center embedded in messenger); custom **bot / AI answer suggestions** before human handoff.
- **Steal:** conversation-first model (matches our chat plan), saved replies in composer, help-center integration.

### Freshdesk — View-based operations
- **Pre-built & custom "Views"** (filtered queues) as the primary navigation; bulk actions bar; **collision detection** ("2 agents viewing"); **scenario automation**; time-bound SLA policies with escalation emails.
- **Steal:** saved views as a first-class nav item, **collision detection** ⭐, bulk bar.

### Linear — the modern UX benchmark (speed as a feature)
- **"Inverted-L" chrome:** persistent sidebar + tab/panel headers reduce noise and increase hierarchy/density (from their redesign write-up: reduce noise, maintain alignment, increase hierarchy and density of navigation).
- **Keyboard-first:** every action has a shortcut; ⌘K palette does everything; list → detail via `Esc`/`Enter` flow; **optimistic updates** — UI updates in ms, not after the network round-trip.
- LCH-based theme system keeps light/dark perceptually uniform.
- **Steal:** ⌘K everything, optimistic UI, keyboard layer, density + alignment discipline, LCH-consistent dark mode.

### Help-center patterns (Dropbox / Litmus / Spotify case studies)
- **Card-based issue categorization** ("What can we help with?"), conversational tone, **gated escalation** (self-service before human), **personalized support visibility**, complete **requester history surfaced to agents**, consolidation of channels into one hub.

---

## 2. New UX ideas for TicketFlow ⭐

| # | Idea | Inspired by | What it looks like in TicketFlow | Effort |
|---|---|---|---|---|
| X1 | **Split ticket workspace** (list ⇄ detail ⇄ context) | Zendesk / Linear | `react-resizable-panels` 3-pane: saved-view list · conversation · right sidebar w/ requester's other tickets, attachments, timeline, properties. Esc closes detail → back to list. | M |
| X2 | **Collision detection** ⭐ ✅ SHIPPED | Freshdesk | Done: presence API (`POST /api/tickets/[id]/presence`, zone `ticket:<id>`, 30s TTL via runtime core) + `ViewersChip` in ticket header — "Dev Manager is viewing" / "N viewing"; polls every 10s, renders nothing for clients/solo. | S–M |
| X3 | **Canned responses (macros)** | Zendesk/Intercom | `Macro` collection (name, body, placeholders `{{name}}`, optional actions: set status/priority). Composer `/:` trigger + palette action; manager-managed. | M |
| X4 | **Saved views as first-class nav** | Freshdesk | "My unassigned", "Urgent this week", dept-scoped, sharable within role; star → sidebar. Extends U6 into a **view engine**. | M |
| X5 | **SLA-lite: response-time promises** ⭐ | Zendesk SLA | First-response + resolution targets by priority; breach → amber/red chip on lists, notification to assignee+manager. No full policy engine yet. | M |
| X6 | **Keyboard layer** | Linear | g+t tickets, g+u users, j/k list nav, x select, c compose, r reply focus, e archive/close; shortcut cheat-sheet modal (`?`). | S–M |
| X7 | **Optimistic UI everywhere** ⭐ | Linear | Status/assignee/priority PATCHes update card instantly; rollback w/ toast on failure. Extend to chat sends (already planned) and kanban drag. | S–M |
| X8 | **Requester 360 side panel** ⭐ | Zendesk/Litmus | In ticket detail: requester's other tickets (status chips), their open count, first-seen date, local time; one-click "create ticket for this requester". | S–M |
| X9 | **Help-center-lite in client portal** ⭐ | Dropbox/Litmus | Card grid "How can we help?" → article pages (new `Article` collection, staff-managed, markdown); ticket form links related articles before submit (deflection); search box front and center. | M–L |
| X10 | **Gated escalation in portal** ⭐ | Dropbox | Before "submit ticket", client answers 2-3 categorization chips; suggestion panel shows matching articles; submit always available — just delayed one beat. | S |
| X11 | **Personalized portal home** ⭐ | Dropbox | Shows plan-appropriate support options, their 5 recent tickets w/ status chips, open-ticket CTA card; replaces bare list. | S |
| X12 | **AI-assist (later)** | Intercom/Zendesk AI | Suggested replies from macros+articles, tone adjust, summarize-thread button. Parked: separate evaluation, opt-in flag. | L |

---

## 3. Upgrade existing surfaces (concrete UX polish)

- **Ticket list:** density toggle (comfortable/compact), column picker, sticky header, inline status pills w/ optimistic change, hover-preview of last message, **age column w/ SLA tint** (X5), keyboard row focus (X6).
- **Sidebar:** collapsible groups, per-item unread counts (from `TicketReadState`), "My queue" pinned by default, ⌘K hint at bottom ("Press ⌘K").
- **Empty states:** illustration + one primary CTA + hint of keyboard shortcut ("No tickets match — press **c** to create one").
- **Toasts:** action-specific with **Undo** for destructive-ish ops (close, bulk ops) — pair with X7.
- **Portal polish:** status timeline visual for clients (Submitted → In progress → Resolved), reorder portal nav by task frequency.
- **A11y & motion:** respect `prefers-reduced-motion`, focus-visible rings everywhere, aria-live on chat + toasts.
- **Client tone:** conversational copy throughout portal ("We're on it — Priya picked this up 2h ago") while keeping routing internals hidden (existing product principle).

---

## 4. Revised priorities (merging with FEATURE-PLAN.md)

**Quick wins (S, high value):** X6 keyboard layer · X7 optimistic UI · ~~X2 collision detection~~ ✅ · X10/X11 portal gating & home
**Cycle 1 (with chat C1):** X1 split workspace + U2 tabs · X8 requester 360 · X3 macros MVP
**Cycle 2:** X4 saved views + U1 ⌘K palette (they share the fuzzy-search index) · X5 SLA-lite · U3 drawer · U4 dark audit
**Cycle 3+:** X9 help-center-lite · U5 kanban · U7 bulk · U9 analytics · X12 AI-assist

---

## 5. References

- Linear — "How we redesigned the Linear UI" (linear.app/now/how-we-redesigned-the-linear-ui) — inverted-L chrome, density/alignment, LCH themes
- LogRocket — "5 support page redesigns that transformed help desk UX" (Dropbox, Litmus, Spotify, Zoom case studies)
- Zendesk Agent Workspace / Intercom Inbox / Freshdesk Views — public docs & comparison write-ups (clearfeed.ai, usepylon.com, swifteq.com)
