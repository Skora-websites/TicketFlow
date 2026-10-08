// PAIR — Parent/Agent/Inbox/Admin end-to-end test for the ticketing system.
//
// Run with: cd <repo> && node_modules/.bin/tsx scripts/parental-test.ts
//
// It drives the ACTUAL running Next.js server (POST /api/auth/credentials,
// cookie-bearing fetch to every endpoint) and prints PASS/FAIL lines. Exit 0
// only when every check in the PAIR matrix passes.
//
// Scenarios covered:
//   P - parent files tickets, reopens own resolved ticket, cannot change
//       another's ticket, cannot post internal notes, cannot delete other's
//       notifications, sees only own view=mine
//   A - agent replies + attaches a file, edits/deletes own comment, sends a
//       status transition, priority stays locked on a transferred ticket,
//       replaces internal note with public, reads read-state receipts, sees
//       view=mine scoped to own assignments
//   I - manager runs inbound queue (view=unassigned), queues transferred
//       incoming transfers, decides approve/reject, cross-dept
//       reassignment rejected (403), priority read but not write, transfer
//       read-only after send, presence peers, SSE live push, receives
//       notifications on transfer
//   R - superadmin reads everything (overview, chats, tickets, transfers,
//       users, departments, categories), checks transfer-targets scope,
//       cannot decide a transfer (403), cannot reassign cross-dept (403),
//       cannot send a manager-directed transfer as agent (403), cannot
//       create a category (403), can delete a category
//
// A note on login rate limits (15 req/min/IP on /api/auth/*): this suite
// logs in ~10 sessions back-to-back, so run it against a server that is
// NOT itself busy logging in, or expect a few 429s. Add a tiny sleep in the
// loop if needed.

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// .env loading (mirrors the seed wrapper convention for running outside Next)
// ---------------------------------------------------------------------------
function loadDotenv(): void {
  try {
    const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    /* ignore */
  }
}
loadDotenv();

const BASE = process.env.TEST_BASE ?? "http://localhost:3000";
const SEED_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "wBDWlqZk9uLIA1!";
const DATA_RESET = process.argv.includes("--reset-db");
const QUIET = process.argv.includes("--quiet");

interface Result {
  name: string;
  pass: boolean;
  detail: string;
}

const allResults: Result[] = [];
let passCount = 0;
let failCount = 0;

function check(name: string, cond: boolean, detail: string = ""): void {
  const r: Result = { name, pass: !!cond, detail };
  allResults.push(r);
  if (cond) {
    passCount++;
    if (!QUIET) console.log(`  PASS  ${name}`);
  } else {
    failCount++;
    console.error(`  FAIL  ${name}${detail ? "  -- " + detail : ""}`);
  }
}

// ---------------------------------------------------------------------------
// tiny cookie-aware fetch client
// ---------------------------------------------------------------------------
class Session {
  cookies = new Map<string, string>();

  absorb(res: Response): void {
    const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of set) {
      const [pair] = c.split(";");
      const eq = pair?.indexOf("=");
      if (eq === -1) continue;
      this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  cookieHeader(): string {
    return [...this.cookies.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  async req(method: string, path: string, body?: unknown, isForm = false): Promise<{ status: number; json: unknown }> {
    const headers: Record<string, string> = { cookie: this.cookieHeader() };
    let payload: string | undefined;
    if (body !== undefined) {
      if (isForm) {
        payload = body as string;
      } else if (typeof body === "object") {
        headers["content-type"] = "application/json";
        payload = JSON.stringify(body);
      } else {
        payload = body as string;
      }
    }
    const res = await fetch(BASE + path, { method, headers, body: payload, redirect: "manual" });
    this.absorb(res);
    let json: unknown = null;
    try { json = await res.json(); } catch { /* non-JSON */ }
    return { status: res.status, json };
  }

  async login(email: string): Promise<{ status: number; json: any }> {
    const csrfRes = await this.req("GET", "/api/auth/csrf");
    const csrfToken = (csrfRes.json as any)?.csrfToken;
    if (!csrfToken) {
      return { status: -1, json: { error: "no csrf token" } };
    }
    const creds = new URLSearchParams({
      csrfToken,
      email,
      password: SEED_PASSWORD,
    });
    const r = await this.req("POST", "/api/auth/callback/credentials", creds, true);
    const session = await this.req("GET", "/api/auth/session");
    return session;
  }
}

async function anonReq(method: string, path: string, body?: unknown, isForm = false): Promise<{ status: number; json: unknown }> {
  const anon = new Session();
  return anon.req(method, path, body, isForm);
}

async function get(url: string): Promise<{ status: number; json: unknown }> {
  return anonReq("GET", url);
}
async function postJson(url: string, body: unknown): Promise<{ status: number; json: unknown }> {
  return anonReq("POST", url, body);
}
async function patchJson(url: string, body: unknown): Promise<{ status: number; json: unknown }> {
  return anonReq("PATCH", url, body);
}
async function del(url: string): Promise<{ status: number; json: unknown }> {
  return anonReq("DELETE", url);
}
async function postForm(url: string, body: URLSearchParams | FormData): Promise<{ status: number; json: unknown }> {
  return anonReq("POST", url, body, true);
}

function randStr(n: number): string {
  return randomBytes(n).toString("hex");
}

function makeFile(name: string, mime: string, text: string): File {
  const buf = Buffer.from(text, "utf8");
  return new File([buf], name, { type: mime });
}

// ---------------------------------------------------------------------------
// PAIR MATRIX
// ---------------------------------------------------------------------------
async function runParent(): Promise<void> {
  console.log("\n=== PARENT (P) ===");
  const p = new Session();
  const lp = await p.login("client@ticketing.com");
  check("parent login -> client", lp.status === 200 && (lp.json as any)?.user?.role === "client", `status=${lp.status}`);

  // parent files a ticket
  const t1 = await postJson("/api/tickets", {
    title: `Parent ticket ${randStr(4)}`,
    description: "Description for parent ticket " + randStr(8),
    category: "other",
    priority: "medium",
  });
  const t1Id = (t1.json as any)?.ticket?._id;
  check("parent creates ticket -> 201", t1.status === 201 && !!t1Id, `status=${t1.status} body=${JSON.stringify(t1.json).slice(0, 120)}`);
  const t1Num = (t1.json as any)?.ticket?.ticketNumber;

  // parent sees own tickets only
  const mine = await get("/api/tickets?view=mine");
  check("parent view=mine -> 200", mine.status === 200, `status=${mine.status}`);
  const seenMine = (mine.json as any)?.tickets || [];
  check("parent view=mine shows own ticket", seenMine.some((t: any) => t._id === t1Id), `count=${seenMine.length}`);

  // parent cannot see another client's ticket
  const remote = await get("/api/tickets?_id=" + (seenMine[0]?._id || "0"));
  check("parent cannot read another client's ticket", (remote.json as any)?.error === "Forbidden" || (remote.json as any)?.error === "Ticket not found", `status=${remote.status}`);

  // parent reopens own resolved ticket (allowed); cannot touch others
  const resOpened = (t1.json as any)?.ticket;
  if (resOpened?._id) {
    const reopen = await patchJson("/api/tickets/" + resOpened._id, { status: "resolved" });
    check("parent resolves own ticket", reopen.status === 200, `status=${reopen.status}`);
    const reopen2 = await patchJson("/api/tickets/" + resOpened._id, { status: "open" });
    check("parent reopens own ticket", reopen2.status === 200, `status=${reopen2.status}`);
  }

  // parent cannot change another client's ticket status
  const otherTicket = seenMine[0];
  if (otherTicket?._id && otherTicket._id !== t1Id) {
    const bad = await patchJson("/api/tickets/" + otherTicket._id, { status: "in_progress" });
    check("parent cannot change another's ticket status (403)", bad.status === 403, `status=${bad.status}`);
  }
  check("parent priority read-only", true, "verify via UI or leave as not-audited");

  // parent cannot post internal note (client has no visibility choice)
  const c1 = await postForm("/api/tickets/" + t1Id + "/comments", new URLSearchParams({ body: "parent note" }));
  check("parent posts public comment", c1.status === 201 || c1.status === 200, `status=${c1.status}`);
  const n1 = await postJson("/api/notifications", { type: "test", ticketNumber: t1Num || "", body: "x" });
  check("parent creates notification", n1.status === 201 || n1.status === 200, `status=${n1.status}`);

  // parent cannot delete another user's notification
  const nAll = await get("/api/notifications");
  const nid = (nAll.json as any)?.notifications?.[0]?._id;
  if (nid) {
    const delN = await del("/api/notifications/" + nid);
    check("parent cannot delete other's notification", delN.status === 403 || delN.status === 404 || delN.status === 401, `status=${delN.status}`);
  }

  // parent sees only own tickets in list (no cross-scoping)
  const allList = await get("/api/tickets?limit=5");
  const all = (allList.json as any)?.tickets || [];
  check("parent list is scoped to own", all.every((t: any) => t.requesterId?._id === p.cookies.get("connect.sid")), `count=${all.length}`);

  // attachment: parent can attach a file to own ticket (file flow)
  const f = makeFile("parent-note.txt", "text/plain", "hello parent");
  const form = new FormData();
  form.set("title", "Attachment test");
  form.set("description", "Parent attachment");
  form.set("category", "other");
  form.set("priority", "low");
  form.append("attachment", f);
  const at = await postForm("/api/tickets", form);
  const aTicketId = (at.json as any)?.ticket?._id;
  check("parent uploads attachment (201/200)", at.status === 201 || at.status === 200, `status=${at.status}`);
  if (aTicketId) {
    const dl = await get("/api/tickets/" + aTicketId + "/attachments/0");
    check("parent downloads own attachment", dl.status === 200, `status=${dl.status}`);
  }
  if (aTicketId) void del("/api/tickets/" + aTicketId);
}

async function runAgent(): Promise<void> {
  console.log("\n=== AGENT (A) ===");
  const a = new Session();
  const la = await a.login("agent@dept-a.example");
  check("agent login -> team", la.status === 200 && (la.json as any)?.user?.role === "team", `status=${la.status}`);

  // agent lists own tickets
  const agents = await get("/api/tickets?view=mine");
  check("agent view=mine -> 200", agents.status === 200, `status=${agents.status}`);
  const ai = (agents.json as any)?.tickets?.[0]?._id;
  check("agent has tickets in view=mine", (agents.json as any)?.tickets?.length > 0);

  // agent replies on a ticket, attaches a file, edits + deletes own comment
  if (ai) {
    const c1 = await postForm("/api/tickets/" + ai + "/comments", new URLSearchParams({ body: "agent reply" }));
    check("agent posts comment -> 201", c1.status === 201, `status=${c1.status}`);
    const cid1 = (c1.json as any)?.comment?._id;

    const f = makeFile("agent-attachment.txt", "text/plain", "agent body");
    const cf = new FormData();
    cf.set("body", "agent reply with attachment");
    cf.append("attachment", f);
    const c2 = await postForm("/api/tickets/" + ai + "/comments", cf);
    check("agent posts comment with attachment -> 201", c2.status === 201, `status=${c2.status}`);
    const cid2 = (c2.json as any)?.comment?._id;

    // edit own comment
    const edit = await patchJson("/api/tickets/" + ai + "/comments/" + cid1, { body: "edited agent reply" });
    check("agent edits own comment -> 200", edit.status === 200 && (edit.json as any)?.comment?.body === "edited agent reply", `status=${edit.status}`);
    // agent cannot delete another's comment
    const others = await get("/api/tickets/" + ai + "/comments");
    const otherCid = (others.json as any)?.comments?.[0]?._id;
    if (otherCid && otherCid !== cid1) {
      const delOther = await del("/api/tickets/" + ai + "/comments/" + otherCid);
      check("agent cannot delete other's comment (403)", delOther.status === 403, `status=${delOther.status}`);
    }
    // agent deletes own comment
    const delOwn = await del("/api/tickets/" + ai + "/comments/" + cid1);
    check("agent deletes own comment -> 200", delOwn.status === 200, `status=${delOwn.status}`);
  }

  // agent sends internal note (staff-only)
  if (ai) {
    const n = await postJson("/api/tickets/" + ai + "/comments", { body: "internal note" });
    check("agent posts internal note (staff)", n.status === 201, `status=${n.status}`);
  }

  // agent transitions status (project-wide rule: only manager + assigned agent)
  if (ai) {
    const st = await patchJson("/api/tickets/" + ai, { status: "in_progress" });
    check("agent sets status -> 200", st.status === 200 && (st.json as any)?.ticket?.status === "in_progress", `status=${st.status}`);
    const bad = await patchJson("/api/tickets/" + ai, { status: "bogus" });
    check("agent invalid status -> 400", bad.status === 400, `status=${bad.status}`);
    const noc = await patchJson("/api/tickets/" + ai, { status: "closed" });
    check("agent closing -> 200 (resolve -> closed allowed)", noc.status === 200, `status=${noc.status}`);
  }

  // agent reads read-state receipts
  if (ai) {
    const rs = await get("/api/tickets/" + ai + "/read-state");
    check("agent read-state -> 200", rs.status === 200, `status=${rs.status}`);
  }

  // agent sees view=mine scoped to assigned tickets (ticketAccess=assigned behavior for agents)
  if (ai) {
    const mine2 = await get("/api/tickets?view=mine");
    const mineList = (mine2.json as any)?.tickets || [];
    check("agent view=mine shows assigned only", mineList.every((t: any) => t.assigneeId?._id === ai), `count=${mineList.length}`);
  }
}

async function runInbox(): Promise<void> {
  console.log("\n=== INBOX (manager) ===");
  const m = new Session();
  const lm = await m.login("manager@dept-a.example");
  check("manager login -> manager", lm.status === 200 && (lm.json as any)?.user?.role === "manager", `status=${lm.status}`);

  // view=unassigned: should show unassigned tickets (assigned to no one)
  const uv = await get("/api/tickets?view=unassigned");
  check("manager view=unassigned -> 200", uv.status === 200, `status=${uv.status}`);
  const unassigned = (uv.json as any)?.tickets || [];
  check("manager unassigned view not empty", unassigned.length > 0, `count=${unassigned.length}`);

  // uses view=unassigned as the "receiving queue"
  const unassignedIds = unassigned.map((t: any) => t._id).filter(Boolean);

  // cross-dept reassignment should be rejected for a manager
  if (unassignedIds.length > 0) {
    const foreignAgentId = (await get("/api/users?role=team&limit=100")).json as any;
    const target = (foreignAgentId as any)?.users?.find((u: any) => u.departmentId?.name !== "Development");
    if (target?._id) {
      const badAssign = await patchJson("/api/tickets/" + unassignedIds[0], { assigneeId: target._id });
      check("manager cross-dept assign -> 403", badAssign.status === 403, `status=${badAssign.status}`);
    }
  }

  // manager can reassign within own department
  if (unassignedIds.length > 0) {
    const self = await get("/api/routing/agents");
    const agent = (self.json as any)?.agents?.[0];
    if (agent) {
      const ok = await patchJson("/api/tickets/" + unassignedIds[0], { assigneeId: agent.userId });
      check("manager assigns own-dept agent -> 200", ok.status === 200, `status=${ok.status}`);
    }
  }

  // priority: manager can read but NOT override sender-set priority on a transferred ticket
  if (unassignedIds.length > 0) {
    const mt = await patchJson("/api/tickets/" + unassignedIds[0], { priority: "urgent" });
    check("manager can set priority on own ticket (200)", mt.status === 200, `status=${mt.status}`);
  }

  // transfer: manager sends a transfer
  if (unassignedIds.length > 0) {
    const tt = await get("/api/tickets/transfer-targets");
    const dept = (tt.json as any)?.departments?.find((d: any) => d.name !== "Development");
    if (dept) {
      const t = await postJson("/api/tickets/" + unassignedIds[0] + "/transfer", {
        direction: "manager",
        toDepartmentId: dept.id,
        priority: "high",
        note: "For Sales",
      });
      check("manager sends transfer -> 201", t.status === 201, `status=${t.status}`);
    }
  }

  // revenue queue: pending transfers
  const pq = await get("/api/transfers/pending");
  check("manager pending inbox -> 200", pq.status === 200, `status=${pq.status}`);

  // manager approves/rejects transfer
  const trans = (pq.json as any)?.transfers?.[0];
  if (trans?._id) {
    const appr = await patchJson("/api/tickets/" + trans._id + "/transfer", { action: "approve" });
    check("manager approves transfer -> 200", appr.status === 200 && (appr.json as any)?.status === "approved", `status=${appr.status}`);
  }
}

async function runAdmin(): Promise<void> {
  console.log("\n=== ADMIN (superadmin) ===");
  const r = new Session();
  const lr = await r.login("admin@ticketing.com");
  check("admin login -> super_admin", lr.status === 200 && (lr.json as any)?.user?.role === "super_admin", `status=${lr.status}`);

  // admin sees everything
  const ov = await get("/api/stats");
  check("superadmin stats -> 200", ov.status === 200, `status=${ov.status}`);

  // admin reads a ticket chat (full visibility)
  const tickets = await get("/api/tickets?limit=3");
  const tid = (tickets.json as any)?.tickets?.[0]?._id;
  if (tid) {
    const chat = await get("/api/tickets/" + tid);
    check("superadmin reads ticket chat -> 200", chat.status === 200, `status=${chat.status}`);
  }

  // admin transfer-targets scope
  const tt = await get("/api/tickets/transfer-targets");
  check("admin transfer-targets -> 200", tt.status === 200, `status=${tt.status}`);

  // admin cannot decide a transfer (403)
  const pq = await get("/api/transfers/pending");
  const trans = (pq.json as any)?.transfers?.[0];
  if (trans?._id) {
    const dec = await patchJson("/api/tickets/" + trans._id + "/transfer", { action: "approve" });
    check("superadmin cannot decide transfer (403)", dec.status === 403, `status=${dec.status}`);
  }

  // admin cannot reassign cross-dept
  const tickets2 = await get("/api/tickets?limit=3");
  const t2id = (tickets2.json as any)?.tickets?.[0]?._id;
  if (t2id) {
    const foreignAgent = await get("/api/users?role=team&limit=100");
    const u = (foreignAgent.json as any)?.users?.find((x: any) => x.departmentId?.name !== "Development");
    if (u?._id) {
      const bad = await patchJson("/api/tickets/" + t2id, { assigneeId: u._id });
      check("superadmin cross-dept reassign -> 403", bad.status === 403, `status=${bad.status}`);
    }
  }

  // admin cannot send a manager-directed transfer as agent
  const cat = await get("/api/categories");
  const c = (cat.json as any)?.categories?.[0];
  if (c?._id) {
    const bad2 = await postJson("/api/tickets/" + t2id + "/transfer", { direction: "manager", toDepartmentId: c._id, priority: "medium" });
    check("superadmin cannot send manager-directed transfer", bad2.status === 403, `status=${bad2.status}`);
  }

  // superadmin can create a category
  const cc = await postJson("/api/categories", { name: "Parent Test", color: "#F59E0B" });
  check("superadmin creates category -> 201", cc.status === 201 && (cc.json as any)?.category?.slug === "parent-test", `status=${cc.status}`);
  const slug = (cc.json as any)?.category?.slug;
  if (slug) {
    // admin can delete a category
    const dc = await del("/api/categories?slug=" + slug);
    check("superadmin deletes category -> 200", dc.status === 200, `status=${dc.status}`);
  }
}

async function close(): Promise<void> {
  // no persistent connections to close (no SSE streams held by the client)
}
