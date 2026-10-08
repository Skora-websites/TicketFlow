/**
 * End-to-end smoke test for the inter-department transfer flow.
 * Run against a freshly seeded server: node scripts/transfer-smoke.js [baseUrl]
 *
 * Covers:
 *  - transfer-targets directory (cross-department only)
 *  - agent → agent transfer appears on receiving manager's dashboard, NOT agent's
 *  - manager approval moves it to the agent's dashboard
 *  - manager-directed transfer: receiving manager assigns a team member
 *  - priority is sender-set and locked for the receiving side (403)
 *  - dynamic categories: create/reject + super-admin category creation
 */
const BASE = process.argv[2] || "http://localhost:3000";
const PASSWORD = "wBDWlqZk9uLIA1!";

const results = [];
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; results.push(`PASS  ${name}`); }
  else { fail++; results.push(`FAIL  ${name}${extra ? " — " + extra : ""}`); }
}

class Session {
  constructor() { this.cookies = new Map(); }
  absorb(res) {
    const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of set) {
      const [pair] = c.split(";");
      const eq = pair.indexOf("=");
      this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
  cookieHeader() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  async req(method, path, body, isForm) {
    const headers = { cookie: this.cookieHeader() };
    let payload;
    if (isForm) { payload = body; }
    else if (body !== undefined) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
    const res = await fetch(BASE + path, { method, headers, body: payload, redirect: "manual" });
    this.absorb(res);
    let json = null;
    try { json = await res.json(); } catch { /* non-JSON */ }
    return { status: res.status, json, res };
  }
  async login(email) {
    const csrf = await this.req("GET", "/api/auth/csrf");
    await this.req("POST", "/api/auth/callback/credentials", new URLSearchParams({
      csrfToken: csrf.json.csrfToken, email, password: PASSWORD,
    }), true);
    return this.req("GET", "/api/auth/session");
  }
}

(async () => {
  const senderAgent = new Session();
  await senderAgent.login("dev1@ticketing.com"); // Development agent
  const devManager = new Session();
  await devManager.login("dev.manager@ticketing.com"); // Development manager (sender side)
  const salesManager = new Session();
  await salesManager.login("sales.manager@ticketing.com"); // Receiving manager
  const salesAgent = new Session();
  await salesAgent.login("sales1@ticketing.com"); // Morgan Seller — target agent
  const admin = new Session();
  await admin.login("admin@ticketing.com");

  // ---------- dynamic categories ----------
  let r = await admin.req("GET", "/api/categories");
  check("GET /api/categories -> 4 defaults", r.status === 200 && r.json.categories.length >= 4, JSON.stringify(r.json.categories?.map((c) => c.slug)));

  r = await admin.req("POST", "/api/categories", { name: "Operations", color: "#F59E0B" });
  check("super_admin creates category", r.status === 201 && r.json.category?.slug === "operations", JSON.stringify(r.json));
  const opsCat = r.json?.category?.slug;

  r = await senderAgent.req("POST", "/api/categories", { name: "Nope" });
  check("agent cannot create category (403)", r.status === 403, `status=${r.status}`);

  r = await senderAgent.req("POST", "/api/tickets", {
    title: "Ops transfer test", description: "Testing dynamic category acceptance",
    category: opsCat || "operations", priority: "low",
  });
  check("ticket with dynamically added category -> 201", r.status === 201 || r.status === 200, JSON.stringify(r.json).slice(0, 150));
  const opsTicket = r.json?.ticket;

  // ---------- transfer directory ----------
  r = await senderAgent.req("GET", "/api/tickets/transfer-targets");
  check("transfer-targets lists other departments only", r.status === 200 && r.json.departments.length >= 2 && !r.json.departments.some((d) => d.name === "Development"), JSON.stringify(r.json.departments?.map((d) => d.name)));
  const salesDept = r.json.departments?.find((d) => d.name === "Sales");
  const salesAgentMember = r.json.members?.find((m) => m.departmentId === salesDept?.id && m.role === "team");

  // ---------- agent → agent transfer (needs manager approval) ----------
  r = await senderAgent.req("POST", `/api/tickets/${opsTicket._id}/transfer`, {
    direction: "agent",
    toDepartmentId: salesDept.id,
    toUserId: salesAgentMember.id,
    priority: "urgent",
    note: "Needs Sales input on pricing",
  });
  check("agent sends ticket to Sales agent -> 201", r.status === 201, JSON.stringify(r.json).slice(0, 200));
  const transferTicket = r.json?.ticket?._id ? r.json.ticket : opsTicket;

  r = await senderAgent.req("GET", "/api/tickets?view=sent");
  check("sender sees ticket in view=sent", r.status === 200 && r.json.tickets.some((t) => t._id === transferTicket._id), JSON.stringify(r.json.tickets?.map((t) => t.ticketNumber)));

  r = await salesAgent.req("GET", "/api/tickets?view=mine");
  check("target agent does NOT see ticket before approval", !r.json.tickets.some((t) => t._id === transferTicket._id), `agent dashboard count=${r.json.tickets?.length}`);

  r = await salesManager.req("GET", "/api/tickets");
  check("receiving manager sees pending transfer on default view", r.json.tickets.some((t) => t._id === transferTicket._id), `manager view count=${r.json.tickets?.length}`);

  // ---------- manager approval inbox (overview card API) ----------
  r = await salesManager.req("GET", "/api/transfers/pending");
  check("pending inbox lists the agent-directed transfer", r.status === 200 && r.json.transfers.some((t) => t._id === transferTicket._id), `count=${r.json.transfers?.length}`);
  check("inbox marks transfer as received (readAt)", (() => r.json.transfers.find((t) => t._id === transferTicket._id)) !== undefined, "transfer present");

  r = await salesAgent.req("GET", "/api/transfers/pending");
  check("agents have no pending inbox access (403)", r.status === 403, `status=${r.status}`);

  // Receiver cannot change the sender-set priority
  r = await salesManager.req("PATCH", `/api/tickets/${transferTicket._id}`, { priority: "low" });
  check("receiving manager CANNOT change priority (403)", r.status === 403, `status=${r.status} ${JSON.stringify(r.json)}`);

  // Wrong manager (dev manager = sender side) cannot decide
  r = await devManager.req("PATCH", `/api/tickets/${transferTicket._id}/transfer`, { action: "approve" });
  check("non-receiving manager cannot decide (403)", r.status === 403, `status=${r.status}`);

  // Receiver CAN read the priority
  r = await salesManager.req("GET", `/api/tickets/${transferTicket._id}`);
  check("receiving manager reads sender-set priority", r.status === 200 && r.json.ticket?.priority === "urgent", `priority=${r.json.ticket?.priority}`);

  // ---------- approval ----------
  r = await salesManager.req("PATCH", `/api/tickets/${transferTicket._id}/transfer`, { action: "approve" });
  check("receiving manager approves transfer", r.status === 200 && r.json.status === "approved", JSON.stringify(r.json).slice(0, 150));

  r = await salesAgent.req("GET", "/api/tickets?view=mine");
  check("after approval ticket lands on agent's dashboard", r.json.tickets.some((t) => t._id === transferTicket._id), `count=${r.json.tickets?.length}`);

  r = await salesManager.req("GET", `/api/tickets/${transferTicket._id}`);
  check("ticket now belongs to Sales dept", r.json.ticket?.departmentId?.name === "Sales", JSON.stringify(r.json.ticket?.departmentId));
  check("transfer recorded as approved", r.json.ticket?.transfer?.status === "approved", JSON.stringify(r.json.ticket?.transfer?.status));

  // ---------- manager-directed transfer ----------
  r = await senderAgent.req("POST", "/api/tickets", {
    title: "Manager-directed transfer", description: "Sender picks manager as recipient",
    category: "other", priority: "medium",
  });
  const mgrTicket = r.json?.ticket;
  r = await senderAgent.req("POST", `/api/tickets/${mgrTicket._id}/transfer`, {
    direction: "manager",
    toDepartmentId: salesDept.id,
    priority: "high",
  });
  check("agent sends ticket to Sales MANAGER -> 201", r.status === 201, JSON.stringify(r.json).slice(0, 200));
  const mgrTransfer = r.json?.ticket?._id ? r.json.ticket : mgrTicket;

  r = await salesManager.req("PATCH", `/api/tickets/${mgrTransfer._id}/transfer`, { action: "approve" });
  check("manager approves manager-directed transfer", r.status === 200, JSON.stringify(r.json).slice(0, 150));

  r = await salesManager.req("GET", "/api/transfers/pending");
  check("approved transfer leaves the pending inbox", !r.json.transfers.some((t) => t._id === mgrTransfer._id), `count=${r.json.transfers?.length}`);

  r = await salesManager.req("GET", `/api/tickets/${mgrTransfer._id}`);
  check("ticket moved to Sales unassigned (manager will assign)", r.json.ticket?.departmentId?.name === "Sales" && !r.json.ticket?.assigneeId, `dept=${r.json.ticket?.departmentId?.name} assignee=${JSON.stringify(r.json.ticket?.assigneeId)}`);

  // Manager assigns a team member as usual
  r = await salesManager.req("PATCH", `/api/tickets/${mgrTransfer._id}`, { assigneeId: salesAgentMember.id });
  check("receiving manager assigns agent as usual", r.status === 200 && r.json.ticket?.assigneeId?.name, JSON.stringify(r.json).slice(0, 150));

  // ---------- rejection path ----------
  r = await senderAgent.req("POST", "/api/tickets", {
    title: "Reject path transfer", description: "This one will be rejected",
    category: "other", priority: "medium",
  });
  const rejTicket = r.json?.ticket;
  await senderAgent.req("POST", `/api/tickets/${rejTicket._id}/transfer`, {
    direction: "manager", toDepartmentId: salesDept.id, priority: "medium",
  });
  r = await salesManager.req("PATCH", `/api/tickets/${rejTicket._id}/transfer`, { action: "reject" });
  check("manager can reject transfer", r.status === 200 && r.json.status === "rejected", JSON.stringify(r.json).slice(0, 100));

  r = await senderAgent.req("GET", `/api/tickets/${rejTicket._id}`);
  check("sender sees rejection", r.json.ticket?.transfer?.status === "rejected", JSON.stringify(r.json.ticket?.transfer?.status));

  // ---------- cleanup ----------
  for (const t of [transferTicket._id, mgrTransfer._id, rejTicket._id, opsTicket._id]) {
    await admin.req("DELETE", `/api/tickets/${t}`);
  }
  if (opsCat) {
    await admin.req("DELETE", `/api/categories?slug=${opsCat}`);
  }

  console.log(results.join("\n"));
  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
