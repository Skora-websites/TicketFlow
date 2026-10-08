# TicketFlow — Full System Workflow

End-to-end flowcharts of the current system. Render in any Mermaid-compatible viewer (GitHub, VS Code, Obsidian).

- **Stack:** Next.js 16 (App Router) · React 19 · MongoDB/Mongoose · NextAuth v5 (JWT sessions) · Zod
- **Roles:** `super_admin` · `manager` · `team` · `client`
- **Legend:** rectangles = actions/states · diamonds = decisions · dashed arrows = email side effects / dev fallbacks

---

## 1. Bird's-eye view (ASCII)

```
                          ┌──────────────────────────────────────────┐
                          │                 CLIENTS                  │
                          │  signup → verify email → /client portal  │
                          └───────────────┬──────────────────────────┘
                                          │ create ticket
                                          ▼
   ADMIN creates staff ┐        ┌──────────────────┐
   (or emails invite)  ├──────► │ ROUTING ENGINE   │──► best agent chosen
                          │        │ (rules + scoring) │    (skills, load,
                          │        └────────┬─────────┘     hours, round-robin)
                          │                 │ assign + notify
                          ▼                 ▼
                 ┌─────────────────────────────────┐
                 │  AGENTS (team) & MANAGERS       │
                 │  /dashboard: queue, tickets,    │
                 │  workload, analytics, rules     │
                 └─────────────────────────────────┘
```

---

## 2. Account creation & role determination

```mermaid
flowchart TD
    A["Visitor opens /signup"] --> B{"Public form<br/>(name, email, password)"}
    B -->|Zod invalid| B
    B --> C["POST /api/auth/register"]
    C --> D{"Email already<br/>registered?"}
    D -->|yes| E["409 — identical generic message<br/>(anti-enumeration)"]
    D -->|no| F["User.create:<br/>role = client<br/>active = false<br/>hashed verify token, 30 min TTL"]
    F -. SMTP configured .-> G["Verification email"]
    F -. no SMTP + dev .-> H["devVerifyUrl returned in response"]
    G --> I["User clicks link<br/>/api/auth/verify/[token]"]
    H --> I
    I --> J{"Token hash match<br/>&lt; 30 min?"}
    J -->|no| K["400 invalid/expired"]
    J -->|yes| L["active = true<br/>token cleared"]
    L --> M["Login at /login<br/>authorize(): reject if !active<br/>JWT embeds id, role, deptId"]

    subgraph StaffPath ["Staff accounts (no self-signup)"]
      N["super_admin / manager<br/>Dashboard → Users"] --> O{"Password<br/>provided?"}
      O -->|no — default| P["Account active=true<br/>placeholder hash<br/>POST /api/users"]
      P --> Q["createInviteToken()<br/>sha256 stored, 7-day TTL"]
      Q -. SMTP .-> R["Invite email"]
      Q -. no SMTP + dev .-> S["devInviteUrl returned"]
      R --> T["Invitee opens /invite/[token]"]
      S --> T
      T --> U["POST /api/auth/invite/[token]<br/>sets own password, clears token,<br/>sessionVersion++, emailVerified set"]
      O -->|yes| V["Admin sets password directly<br/>(offline onboarding path)"]
      U --> M
      V --> M
    end

    subgraph OAuth ["First-time OAuth (Google/GitHub)"]
      W["Provider login"] --> X{"Email verified at<br/>provider? (GitHub: emails API,<br/>fail closed)"}
      X -->|no| Y["signIn = false — refused"]
      X -->|yes| Z{"Existing user?"}
      Z -->|no| AA["Auto-provision<br/>role = client, active = true,<br/>random unusable password"]
      Z -->|yes| AB{"active?"}
      AB -->|no| Y
      AB -->|yes| M
      AA --> M
    end
```

---

## 3. Login & session lifecycle

```mermaid
flowchart TD
    A["POST /api/auth/callback/credentials"] --> B["authorize():<br/>type-check creds (no $ne injection)<br/>lookup +passwordHash, reject !active,<br/>bcrypt verify"]
    B -->|fail| C["CredentialsSignin — 302 w/o session"]
    B -->|pass| D["jwt callback: DB = source of truth<br/>token = id, role, deptId, active, sessionVersion"]
    D --> E["rm=1 cookie? → token.exp = 120 days<br/>else 30 days"]
    E --> F["session callback → session.user"]

    F --> G["Every later request:<br/>jwt re-validation (60s TTL cache)"]
    G --> H{"DB user exists<br/>& active?"}
    H -->|no| I["token.active = false<br/>→ empty session → treated as logged out"]
    H -->|yes| J{"token.sessionVersion<br/>=== db.sessionVersion?"}
    J -->|no| I
    J -->|yes| K["active = true<br/>role/deptId refreshed from DB"]
    K --> L["sessionUserCache.set(id)<br/>(bounded, cleared > 1000)"]

    M["Password change / reset /<br/>invite redemption"] --> N["sessionVersion++<br/>invalidateSessionCheck()"]
    N --> J
    O["Role or dept changed<br/>(admin PATCH)"] --> P["invalidatePermissionsCheck()"]
    P --> G
```

---

## 4. Request authorization — 3 layers

```mermaid
flowchart TD
    REQ["Incoming request"] --> MW["LAYER 1 — proxy.ts (edge)"]

    MW --> RL{"Path starts /api/auth<br/>& not GET session?"}
    RL -->|yes| R2{"≤ 15 req/min per IP?<br/>(rightmost XFF entry)"}
    R2 -->|no| R3["429"]
    R2 -->|yes| NEXT

    MW --> PROT{"Protected path?<br/>/dashboard /client /api/tickets<br/>/api/users /api/departments<br/>/api/stats"}
    PROT -->|yes & no token| P2{"API?"}
    P2 -->|yes| P3["401 JSON"]
    P2 -->|no| P4["redirect /login (return-to preserved)"]
    PROT -->|no token needed| NEXT["NextResponse.next()"]

    MW --> RB{"Role bounce"}
    RB -->|"client → /dashboard/*"| RB1["redirect /client/tickets"]
    RB -->|"staff → /client/*"| RB2["redirect /dashboard/overview"]
    RB -->|ok| NEXT

    NEXT --> PAGE["LAYER 2 — page guard (RSC)"]
    PAGE --> Q{"requireRole(...roles)"}
    Q -->|no session| Q1["redirect /login"]
    Q -->|wrong role| Q2["redirect /unauthorized"]
    Q -->|ok| Q3["render page"]

    NEXT --> API["LAYER 3 — API handler"]
    API --> R{"requireApiRole(...roles)"}
    R -->|no session| R4["401 JSON"]
    R -->|wrong role| R5["403 JSON"]
    R -->|ok| DOC{"Per-document checks<br/>canAccessTicket()<br/>canTransitionStatus()<br/>manager dept scoping"}
    DOC -->|pass| R6["Data returned<br/>(scoped by dept/ownership)"]
    DOC -->|fail| R7["403 / 404"]
```

Page guard map:

| Page | requireRole |
|---|---|
| overview, tickets, tickets/new, tickets/[id], notifications | super_admin, manager, team |
| analytics, workload, queue, departments, users, routing | super_admin, manager |

API role map (write endpoints):

| Endpoint | requireApiRole |
|---|---|
| POST/PATCH/DELETE users | super_admin (manager limited, see §2) |
| DELETE departments | super_admin |
| routing rules CRUD, preview | super_admin, manager |
| routing agents | super_admin, manager, team |
| tickets, comments, attachments, notifications | all four roles + per-document checks |

---

## 5. Ticket lifecycle

```mermaid
flowchart TD
    A["Ticket created<br/>(client portal, dashboard form,<br/>or API JSON/FormData)"] --> B["Validate (Zod)<br/>attachments: magic-byte sniff,<br/>allowlist, 4MB, ≤5 files"]
    B --> C["Persist: TK-XXXX number,<br/>status=open"]
    C --> D["Auto-routing engine<br/>routeTicket()"]
    D --> E{"Active rules<br/>(priority order) match?<br/>keyword/category/priority/requester"}
    E -->|yes| F["Apply actions<br/>(assign_user, assign_department,<br/>set_priority, set_status)<br/>rule.stats.matchCount++"]
    E -->|no rule| G["Unassigned queue<br/>(department from requester's<br/>manager or fallback)"]
    F --> H["pickBestAgent() among department candidates"]
    G --> H2["Manager assigns manually<br/>(PATCH assigneeId)"]
    H --> I["Assignment + Notification<br/>(in-app + best-effort email)"]
    H2 --> I

    I --> J["Agent works ticket"]
    J --> K{"Status transition?<br/>canTransitionStatus()"}
    K -->|"client (own ticket)"| K1["resolved/closed → open only<br/>(reopen)"]
    K -->|"team"| K2["state machine:<br/>open→in_progress/on_hold<br/>in_progress→on_hold/resolved/open<br/>on_hold→in_progress/open<br/>resolved→closed/open<br/>closed→open"]
    K -->|"manager / super_admin"| K3["any transition"]
    K1 & K2 & K3 --> L["Ticket resolved → closed<br/>closedAt set"]
    L --> M["Client can reopen<br/>(back to open)"]
```

---

## 6. Auto-routing engine detail

```mermaid
flowchart TD
    A["routeTicket(ticket)"] --> B["Load active rules<br/>sorted by priority asc"]
    B --> C{"For each rule:<br/>matchType any/all"}
    C --> D{"Conditions match?<br/>keyword contains · category equals/in<br/>priority equals/in · requester equals"}
    D -->|match| E["Collect rule actions"]
    D -->|no| C
    E --> F{"Explicit<br/>assign_user action?"}
    F -->|yes| G["Assign that user<br/>bump rule stats"]
    F -->|no| H["Candidate pool = agents of<br/>action/target department<br/>(or fallback dept)"]
    G --> Z["Notify assignee"]
    H --> I["pickBestAgent() scoring:<br/>+10 per matching skill<br/>+ availability (available > busy)<br/>+ working hours check (Intl, per schedule TZ)<br/>+ capacity headroom (currentLoad &lt; capacity)<br/>+ lowest live load (aggregation)<br/>tie → round-robin (least-recently-assigned)"]
    I --> J{"Candidate found?"}
    J -->|yes| G2["Assign best agent<br/>bump rule stats"]
    J -->|no| K["Fallback: fallbackAssigneeId<br/>else unassigned queue"]
    G2 --> Z
    K --> Z2["Notify manager / unassigned queue"]

    P["POST /api/routing/preview<br/>(staff types ticket)"] --> Q["Dry run — same logic,<br/>dryRun flag → stats NOT bumped"]
    Q --> R["Show: matched rule, would-assign agent,<br/>score breakdown"]
```

---

## 7. Notifications & email

```mermaid
flowchart TD
    A["Event: ticket assigned /<br/>status changed / comment added"] --> B["Notification.create<br/>(in-app, per-user)"]
    A --> C["sendTicketNotificationEmail()<br/>— best-effort, never throws"]
    C --> D{"SMTP configured?"}
    D -->|yes| E["Delivered"]
    D -->|no| F["Skipped silently"]
    B --> G["Bell menu +<br/>/dashboard/notifications<br/>+ POST read-all"]

    H["Auth emails"] --> I{"SMTP?"}
    I -->|yes| J["verify / reset / invite delivered"]
    I -->|no + dev| K["Link surfaced in API response<br/>(devVerifyUrl / devResetUrl / devInviteUrl)<br/>NEVER in production"]
```

---

## 8. Data model (relations)

```mermaid
erDiagram
    USER ||--o{ TICKET : requests
    USER ||--o{ TICKET : assigns
    USER ||--o{ COMMENT : writes
    USER ||--o{ NOTIFICATION : receives
    USER ||--o| AGENT_AVAILABILITY : has
    DEPARTMENT ||--o{ USER : employs
    DEPARTMENT ||--o{ TICKET : scopes
    TICKET ||--o{ COMMENT : has
    TICKET ||--o{ ATTACHMENT : carries
    TICKET ||--o{ NOTIFICATION : triggers
    ROUTING_RULE ||--o{ ROUTING_CONDITION : has
    ROUTING_RULE ||--o{ ROUTING_ACTION : applies
    ROUTING_RULE }o--|| USER : createdBy
```

---

## 9. Environments & operations

```mermaid
flowchart LR
    subgraph Dev ["Local dev (this machine)"]
        M["mongod 6.0.14 (bundled)<br/>127.0.0.1:27017<br/>dbpath .mongodb-data"]
        N["next dev --webpack<br/>:3000"]
        O["tsx scripts: seed,<br/>regression tests, smoke"]
    end
    M <--> N
    O <--> M
    O <--> N

    subgraph Prod ["Production notes"]
        P["SMTP required for<br/>verify/reset/invite"]
        Q["Rate limit per-process →<br/>use Redis multi-instance"]
        R["Attachments inline BSON →<br/>migrate GridFS before 16MB"]
    end
```

---

## 10. Where to look (code index)

| Concern | File |
|---|---|
| Auth config, session re-validation | `src/lib/auth.ts` |
| requireRole / requireApiRole / canAccessTicket / canTransitionStatus | `src/lib/authz.ts` |
| Edge middleware, rate limiting | `src/proxy.ts` |
| Register / verify / reset / invite endpoints | `src/app/api/auth/**` |
| Invite tokens | removed 2026-09-30 (invite-link flow deleted; credential email only) |
| User CRUD (create policy + edit ticketAccess/reportingManager) | `src/app/api/users/**` |
| Tickets, comments, attachments | `src/app/api/tickets/**` |
| Routing engine | `src/lib/routing/engine.ts` |
| Rule scope | `src/lib/routing/ruleScope.ts` |
| Models | `src/lib/db/models.ts` |
| Seed | `src/lib/db/seed.ts`, `npm run seed` |
| Tests | `npm test` (typecheck + 5 regression suites, 92 assertions incl. the runtime core), `scripts/api-smoke.js` (55), `scripts/transfer-smoke.js` (26), `scripts/page-render-smoke.js` (6 pages), `scripts/invite-smoke.js` (24 — credential-email user-creation policy, kept the filename for history) |
