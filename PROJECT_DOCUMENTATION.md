# TicketFlow — Complete Project Documentation & System Guide

Welcome to **TicketFlow**, a modern, full-stack, role-based helpdesk and ticketing platform built with **Next.js 16**, **React 19**, **TypeScript**, and **MongoDB**. 

TicketFlow is designed to bridge the gap between clients needing fast resolutions and customer support teams managing high volumes of incoming tickets. It combines an intelligent **Auto-Routing Engine**, **Department-Scoped Access Control**, **Real-Time WhatsApp-Style Chat**, and **Optimistic Client-Side Caching** for instant performance.

---

## Table of Contents

1. [Executive Summary & Core Concepts](#1-executive-summary--core-concepts)
2. [User Roles & Permission Matrix](#2-user-roles--permission-matrix)
3. [The Ticket Lifecycle](#3-the-ticket-lifecycle)
4. [Key System Features](#4-key-system-features)
   - [Smart Auto-Routing Engine](#smart-auto-routing-engine)
   - [Unassigned Queue & Assignment](#unassigned-queue--assignment)
   - [Real-Time Conversation & Messaging](#real-time-conversation--messaging)
   - [Analytics, Workload & Heatmaps](#analytics-workload--heatmaps)
   - [Optimistic UI & Client-Side Caching](#optimistic-ui--client-side-caching)
   - [Security, Rate Limits & Quotas](#security-rate-limits--quotas)
5. [Application Architecture & Tech Stack](#5-application-architecture--tech-stack)
6. [Database Schema & Models](#6-database-schema--models)
7. [API Design & Endpoints](#7-api-design--endpoints)
8. [Local Development & Setup Guide](#8-local-development--setup-guide)
9. [Deployment (Vercel & MongoDB Atlas)](#9-deployment-vercel--mongodb-atlas)
10. [Frequently Asked Questions (FAQ) & Troubleshooting](#10-frequently-asked-questions-faq--troubleshooting)

---

## 1. Executive Summary & Core Concepts

### Why TicketFlow?
In traditional helpdesk software, tickets are either dumped into an unorganized queue or assigned arbitrarily, causing delayed responses, agent burnout, and lost context. 

TicketFlow solves this with three pillars:
1. **Zero-Delay Routing**: Incoming tickets are evaluated in milliseconds against keyword, category, and priority rules, automatically matching the most suitable agent based on skills, schedule, and current workload.
2. **Clean Boundary of Trust**: Clients have their own lightweight portal (`/client`) where they see only their issues with simple updates. Staff work in a full-featured operational dashboard (`/dashboard`) with internal notes, team workload metrics, and departmental controls.
3. **Instant Experience**: Every status change, reply, and ticket assignment updates optimistically in the user's browser without page reloads or waiting for round-trip latency.

---

## 2. User Roles & Permission Matrix

TicketFlow enforces a strict, multi-tiered access model across Middleware, Page Guards, and Database-level queries.

```
       ┌───────────────────────────────┐
       │         SUPER ADMIN           │ (Org-wide Governance)
       └──────────────┬────────────────┘
                      │
       ┌──────────────▼────────────────┐
       │      DEPARTMENT MANAGER       │ (Department Leadership & Triage)
       └──────────────┬────────────────┘
                      │
       ┌──────────────▼────────────────┐
       │         TEAM AGENT            │ (Resolution & Customer Comms)
       └───────────────────────────────┘
                      ▲
                      │ (Files tickets via Client Portal)
       ┌──────────────┴────────────────┐
       │            CLIENT             │ (External User)
       └───────────────────────────────┘
```

### Role Breakdown

| Role | Primary Surface | Capabilities & Responsibilities | Key Boundaries & Restrictions |
|---|---|---|---|
| **Super Admin** | `/dashboard/*` | Org-wide governance, creates departments, custom categories, invites managers, monitors all metrics. | Does **not** work tickets directly: cannot change ticket status/priority, cannot post in ticket chats, cannot approve transfers. |
| **Manager** | `/dashboard/*` | Runs a single department, manages agent workload, assigns tickets from the Unassigned Queue, changes ticket statuses. | Locked to their own department's users and tickets. Cannot view other departments' internal operations. |
| **Team Agent** | `/dashboard/tickets` | Resolves tickets, communicates with clients, adds internal staff-only notes, moves ticket workflow steps. | Access is configured at creation: can view **all department tickets** (default) or **only assigned tickets**. Cannot reassign tickets across departments. |
| **Client** | `/client/*` | Submits new tickets, tracks resolution progress, replies to agents, reopens resolved tickets if needed. | **Zero internal noise**: Never sees internal staff notes, routing rules, agent workload, or backend priority tags. |

---

## 3. The Ticket Lifecycle

Every ticket in TicketFlow moves through a predictable, state-controlled lifecycle:

```
[ New Ticket Submitted ]
           │
           ▼
[ Auto-Routing Engine ] ──(Rule Match + Available Agent)──► [ Assigned to Agent ]
           │                                                      │
     (No Match / Offline)                                         │
           │                                                      ▼
           ▼                                               [ Status: Open ]
[ Unassigned Queue ]                                              │
           │                                                      ▼
   (Manager Assigns)                                       [ Status: In Progress ]
           └──────────────────────────────────────────────────────┤
                                                                  ▼
                                                           [ Status: On Hold ] (Awaiting input)
                                                                  │
                                                                  ▼
                                                           [ Status: Resolved ]
                                                                  │
                                                  ┌───────────────┴───────────────┐
                                                  ▼                               ▼
                                            [ Client Reopens ]             [ Closed ]
                                            (Back to In Progress)      (Thread Freezes)
```

### Status Definitions
1. **Open**: Ticket has been created and assigned, waiting for the agent's initial assessment.
2. **In Progress**: The agent has actively started investigating, testing, or replying.
3. **On Hold**: The agent is waiting for external dependencies, vendor feedback, or customer clarification.
4. **Resolved**: The issue is fixed and a solution provided to the client.
5. **Closed**: Ticket is completed. Conversation is frozen to prevent post-mortem drift. (Clients retain a 1-click option to reopen if the issue recurs).

---

## 4. Key System Features

### Smart Auto-Routing Engine
*Location: `src/lib/routing/engine.ts`*

The routing engine replaces manual ticket triage with algorithmic assignment:
- **Priority Rules**: Evaluates active rules in priority order (e.g., "Urgent billing queries go to Tier-2 Finance").
- **Multi-Factor Agent Scoring**:
  - **Skills Match (+10 pts)**: Matches ticket keywords and tags against agent skills.
  - **Availability**: Checks if the agent is marked available and not on leave.
  - **Working Hours & Timezones**: Calculates local time in the agent's schedule using `Intl.DateTimeFormat` to ensure agents aren't assigned tickets outside their shift.
  - **Live Capacity Headroom**: Balances active tickets against the agent's configured maximum concurrency limit.
- **Dry-Run Simulator**: Built into the admin dashboard (`/dashboard/routing`), allowing managers to simulate how a ticket would route before deploying a new rule.

### Unassigned Queue & Assignment
*Location: `src/app/dashboard/queue/QueueContent.tsx`*

When an incoming ticket does not trigger an auto-routing rule (or all eligible agents are offline/at capacity), it safely lands in the **Unassigned Queue**.
- **Managers** see a live count badge in their navigation.
- **One-Click Assignment**: Managers pick from eligible departmental team members.
- **Forwarding**: Super Admins can forward unassigned tickets to department managers.

### Real-Time Conversation & Messaging
*Location: `src/components/tickets/conversation/TicketConversation.tsx`*

TicketFlow features a custom WhatsApp-style chat interface:
- **Message Bubbles**: The logged-in user's replies appear on the right; the counterparty appears on the left with avatar and role badges.
- **Public Messages vs. Internal Notes**: Staff can toggle "Internal Note" mode to discuss technical details, paste logs, or coordinate without exposing anything to the client. Internal notes feature a distinct yellow background and lock icon.
- **Real-Time Updates**: Leverages Server-Sent Events (SSE) so replies appear instantaneously without manual browser refreshes.
- **Read Receipts**: Visual message states (sent $\rightarrow$ grey delivered $\rightarrow$ blue read).

### Analytics, Workload & Heatmaps
*Location: `src/app/dashboard/analytics/` & `src/app/dashboard/workload/`*

- **Team Workload Matrix**: Displays each agent's active load, capacity utilization percentage, and burnout risk indicator.
- **Aggregated Analytics**: Shows Average Resolution Time, First Response Time, SLA compliance rate, and Ticket Volume Trends over time.
- **Activity Heatmap**: Visual GitHub-style commit heatmap displaying resolution intensity across days and weeks.

### Optimistic UI & Client-Side Caching
*Location: `src/lib/client-cache.ts`*

- **Instant Feel**: Status updates, ticket creation, and category changes reflect in the browser immediately while the network request resolves in the background.
- **In-Memory TTL Cache**: Client-side requests for static/semi-static data (users list, departments, categories) are cached in memory (default 30–60s) to eliminate duplicate API requests during route navigation.

### Security, Rate Limits & Quotas
*Location: `src/lib/security.ts` & `src/lib/fileValidation.ts`*

- **Rate Limiting**: Sliding window rate limiter protecting authentication endpoints (15 req/min), comment posting (30/min), and ticket creation.
- **Daily Quotas**: Safeguards against spam by capping client ticket creation (25 tickets/day per client).
- **Magic-Byte Sniffing**: Uploaded file attachments are verified by their true binary signature (magic bytes), rejecting malicious files disguised with innocent extensions.
- **Database Query Timeouts**: All MongoDB queries include `maxTimeMS` guards to prevent runaway long queries from locking database threads.

---

## 5. Application Architecture & Tech Stack

```
┌────────────────────────────────────────────────────────┐
│                   CLIENT (BROWSER)                     │
│  React 19 Server & Client Components · Tailwind CSS 4  │
│       Radix UI / shadcn · In-Memory Client Cache       │
└───────────────────────────▲────────────────────────────┘
                            │ HTTP / JSON / SSE
┌───────────────────────────▼────────────────────────────┐
│                    NEXT.JS 16 APP                      │
│   App Router · NextAuth v5 (Auth.js) · Zod Validation  │
│         Edge Middleware · Auto-Routing Engine          │
└───────────────────────────▲────────────────────────────┘
                            │ Mongoose ODM
┌───────────────────────────▼────────────────────────────┐
│                    MONGODB DATABASE                    │
│   Users · Tickets · Departments · Rules · Comments     │
└────────────────────────────────────────────────────────┘
```

- **Framework**: Next.js 16 (App Router with webpack)
- **Frontend**: React 19, Tailwind CSS 4, Radix UI Primitives, Lucide Icons, Recharts
- **Backend**: Next.js Server Actions & API Route Handlers
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: NextAuth v5 (Auth.js) with JWT session strategy and 60-second database revalidation TTL
- **Type Safety**: TypeScript 5 with strict mode & Zod runtime validation

---

## 6. Database Schema & Models

*Location: `src/lib/db/models.ts`*

### Key Collections

1. **User (`User`)**
   - Credentials (`email`, `passwordHash`)
   - Role (`super_admin`, `manager`, `team`, `client`)
   - Scope (`departmentId`, `ticketAccess`: `'department' | 'assigned'`)
   - Working hours, skills list, max active tickets capacity, avatar string.

2. **Department (`Department`)**
   - `name`, `color` (hex), `description`.

3. **Category (`Category`)**
   - Dynamic ticket taxonomy: `name`, `color`, optional `departmentId` linkage.

4. **Ticket (`Ticket`)**
   - `ticketNumber` (e.g. `TK-0042`)
   - `title`, `description`, `category`, `priority` (`low`, `medium`, `high`, `urgent`)
   - `status` (`open`, `in_progress`, `on_hold`, `resolved`, `closed`)
   - Relational references: `requesterId`, `assigneeId`, `departmentId`
   - Attachment metadata & audit timestamps (`createdAt`, `closedAt`).

5. **Comment / Message (`Comment`)**
   - `ticketId`, `authorId`, `content`
   - `kind`: `'message' | 'internal_note' | 'system'`
   - `visibility`: `'public' | 'staff_only'`
   - Read receipt tracking arrays.

6. **Routing Rule (`RoutingRule`)**
   - `name`, `priority` (execution order), `active` (boolean)
   - Conditions: `keywords`, `categories`, `priorities`
   - Assignment targets: target department, required agent skills, fallback strategy.

---

## 7. API Design & Endpoints

All endpoints require active session authentication and enforce role verification.

### Core Endpoints

| Method | Endpoint | Allowed Roles | Description | Pagination Limit |
|---|---|---|---|---|
| `GET` | `/api/tickets` | All (scoped) | List tickets with filters (`view`, `status`, `priority`) | `limit` $\le 100$ |
| `POST` | `/api/tickets` | All | Create a new ticket (triggers auto-routing) | N/A |
| `GET` | `/api/tickets/[id]` | Permitted | Fetch ticket details and verify access rights | N/A |
| `PATCH` | `/api/tickets/[id]` | Staff / Manager | Update status, reassign, or adjust properties | N/A |
| `GET` | `/api/tickets/[id]/comments` | Permitted | Fetch conversation thread messages | `limit` $\le 50$ |
| `POST` | `/api/tickets/[id]/comments` | Permitted | Post a public message or internal note | N/A |
| `GET` | `/api/users` | Admin, Manager | Fetch staff directory / assignable team members | `limit` $\le 100$ |
| `POST` | `/api/users` | Admin, Manager | Invite new agent or manager | N/A |
| `GET` | `/api/departments` | Admin, Manager | List all departments | `limit` $\le 100$ |
| `POST` | `/api/departments` | Admin | Create a new department | N/A |
| `GET` | `/api/categories` | All Staff | List ticket categories | N/A |
| `GET` | `/api/routing/rules` | Admin, Manager | List auto-routing rules | `limit` $\le 50$ |
| `POST` | `/api/routing/preview` | Admin, Manager | Dry-run simulate routing for ticket input | N/A |

---

## 8. Local Development & Setup Guide

### Prerequisites
- **Node.js**: Version `20.x` or higher
- **MongoDB**: Local MongoDB instance running on `127.0.0.1:27017` or a MongoDB Atlas connection string.

### Setup Instructions

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Skora-websites/TicketFlow.git
   cd TicketFlow
   ```

2. **Configure Environment Variables**:
   Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
   Ensure `AUTH_SECRET` and `MONGODB_URI` are defined:
   ```env
   AUTH_SECRET="your-generated-random-32-byte-secret"
   MONGODB_URI="mongodb://127.0.0.1:27017/ticketflow"
   ```

3. **Install Dependencies**:
   ```bash
   npm install --legacy-peer-deps
   ```

4. **Seed Demo Data**:
   Populates sample departments, accounts, tickets, and routing rules:
   ```bash
   npm run seed
   ```

5. **Start Development Server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

### Default Demo Credentials (from Seed)
All seed accounts share the default password: `wBDWlqZk9uLIA1!`

| Persona | Role | Email |
|---|---|---|
| Eleanor Vance | Super Admin | `admin@ticketing.com` |
| Marcus Brody | Dev Manager | `dev.manager@ticketing.com` |
| Alex Chen | Dev Agent | `dev1@ticketing.com` |
| Sarah Connor | Client | `client1@example.com` |

### Running Verifications & Tests
```bash
npm run typecheck   # Typecheck entire codebase without emitting JS
npm test            # Run full test suite (auth matrix, quotas, avatars, routing)
npm run lint        # ESLint verification
```

---

## 9. Deployment (Vercel & MongoDB Atlas)

TicketFlow is pre-configured for automated **Vercel** deployment.

### 1. MongoDB Atlas Setup
- Create a free or dedicated cluster on [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
- Under **Network Access**, allow access from anywhere (`0.0.0.0/0`) or configure Vercel IP integration.
- Copy your connection string into `MONGODB_URI`.

### 2. Vercel Environment Variables
Add the following in your Vercel Project Settings:
- `MONGODB_URI`: Your MongoDB Atlas URI.
- `AUTH_SECRET`: A secure 32-character string (generate via `openssl rand -base64 32`).
- `NEXT_PUBLIC_APP_URL`: Your production URL (e.g., `https://ticket-flow-skora.vercel.app`).
- `SMTP_*` *(Optional)*: Required only if automated outbound emails for invites and resets are desired. If omitted, the app runs without external email dependencies.

---

## 10. Frequently Asked Questions (FAQ) & Troubleshooting

#### Q: The Unassigned Queue shows "Failed to fetch managers" or "Failed to fetch team members".
**A**: This occurs if the user query schema rejects pagination queries with `limit=100`. In `src/app/api/users/route.ts`, verify that `limit` accepts up to `100`:
```typescript
limit: z.coerce.number().positive().max(100).default(20)
```

#### Q: How do clients reopen a ticket?
**A**: Clients can navigate to any resolved ticket in their portal (`/client/tickets/[id]`) and click the **"Reopen Ticket"** button. This automatically updates the status back to `in_progress` and notifies the assigned agent.

#### Q: Why can't the Super Admin send messages in a ticket chat?
**A**: By architectural design, ticket conversations are strictly limited to the **requester (client)**, the **assigned agent**, and the **department manager**. This prevents accidental commitments from executives and maintains an authentic paper trail. Super Admins have read-only visibility into all conversations.

#### Q: Can tickets be transferred between departments?
**A**: The underlying transfer engine and state machine (`/api/tickets/[id]/transfer`) are fully built and tested. However, inter-department transfers are currently disabled in the user interface via `TRANSFERS_ENABLED = false` in `src/lib/features.ts` to enforce single-team accountability. Switching this flag to `true` re-enables the full transfer workflow.

---

*Documentation maintained by the Engineering Team. For code contributions or bug reports, please refer to the repository issue tracker.*
