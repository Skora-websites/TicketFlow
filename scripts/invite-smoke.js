/* User-creation (credential email) smoke test — exercises the manager /
 * super-admin "add user" policy end to end against a running server.
 *
 * Replaces the old invite-link smoke test: accounts are no longer created
 * via invite tokens; credentials are emailed instead (dev fallback returns
 * `devCredentials` when SMTP is not configured, never in production).
 *
 * Self-cleaning: deletes the users it creates at the end (they own no
 * tickets/comments, so DELETE is allowed).
 *
 * Usage: node scripts/invite-smoke.js [baseUrl]   (defaults to :3000)
 */
const BASE = process.argv[2] || "http://localhost:3000";
const PASSWORD = "wBDWlqZk9uLIA1!";
const STAMP = Date.now();
const AGENT_EMAIL = `cred-smoke-agent-${STAMP}@example.com`;
const MANAGER_EMAIL = `cred-smoke-manager-${STAMP}@example.com`;

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
  async login(email, password = PASSWORD) {
    const csrf = await this.req("GET", "/api/auth/csrf");
    await this.req("POST", "/api/auth/callback/credentials", new URLSearchParams({
      csrfToken: csrf.json.csrfToken, email, password,
    }), true);
    return this.req("GET", "/api/auth/session");
  }
}

(async () => {
  const admin = new Session();
  let r = await admin.login("admin@ticketing.com");
  check("admin login", r.json?.user?.role === "super_admin", JSON.stringify(r.json));

  const devManager = new Session();
  r = await devManager.login("dev.manager@ticketing.com");
  const devDeptId = r.json?.user?.departmentId;
  check("dev manager login (has departmentId)", r.json?.user?.role === "manager" && !!devDeptId, JSON.stringify(r.json));

  // ---------- 1. Who may create whom ----------
  // Agent (team) → users must be 403.
  const agent = new Session();
  r = await agent.login("dev1@ticketing.com");
  check("dev agent login", r.json?.user?.role === "team", JSON.stringify(r.json));
  r = await agent.req("POST", "/api/users", {
    name: "Nope Agent", email: `nope-${STAMP}@example.com`, role: "team",
  });
  check("agent cannot create users -> 403", r.status === 403, `status=${r.status}`);

  // Manager → manager must be 403.
  r = await devManager.req("POST", "/api/users", {
    name: "Nope Manager", email: `nope-m-${STAMP}@example.com`, role: "manager", departmentId: devDeptId,
  });
  check("manager cannot create manager -> 403", r.status === 403, `status=${r.status} body=${JSON.stringify(r.json)}`);

  // Manager cross-department agent must be 403.
  r = await admin.req("GET", "/api/departments?limit=100");
  const depts = r.json?.departments ?? [];
  check("departments list", r.status === 200 && depts.length >= 2, JSON.stringify(depts.map((d) => d.name)));
  const salesDept = depts.find((d) => d.name === "Sales");
  r = await devManager.req("POST", "/api/users", {
    name: "Nope Cross", email: `nope-x-${STAMP}@example.com`, role: "team", departmentId: salesDept?._id,
  });
  check("manager cross-dept agent -> 403", r.status === 403, `status=${r.status} body=${JSON.stringify(r.json)}`);

  // Super admin → super admin must be 403.
  r = await admin.req("POST", "/api/users", {
    name: "Nope Super", email: `nope-s-${STAMP}@example.com`, role: "super_admin",
  });
  check("super admin cannot create another super admin -> 403", r.status === 403, `status=${r.status}`);

  // Super admin → manager without department must be 400.
  r = await admin.req("POST", "/api/users", {
    name: "No Dept Manager", email: `nope-nd-${STAMP}@example.com`, role: "manager",
  });
  check("manager without department -> 400", r.status === 400, `status=${r.status} body=${JSON.stringify(r.json)}`);

  // ---------- 2. Happy paths ----------
  // Manager adds an agent (assigned scope) in their own department.
  // SMTP is not configured in dev, so the response carries devCredentials —
  // proof the credential email WOULD have gone out with these credentials.
  r = await devManager.req("POST", "/api/users", {
    name: "Cred Smoke Agent", email: AGENT_EMAIL, role: "team",
    departmentId: devDeptId, ticketAccess: "assigned",
  });
  const agentUser = r.json?.user;
  const agentCreds = r.json?.devCredentials;
  check("manager adds assigned-scope agent -> 201", r.status === 201 && !!agentUser?._id, `status=${r.status} body=${JSON.stringify(r.json).slice(0, 200)}`);
  check("created agent has ticketAccess=assigned", agentUser?.ticketAccess === "assigned", `got=${agentUser?.ticketAccess}`);
  check("no passwordHash leaks in response", !("passwordHash" in (agentUser ?? {})) && !("inviteToken" in (agentUser ?? {})));
  check("dev fallback returns devCredentials", !!agentCreds?.email && typeof agentCreds?.password === "string" && agentCreds.password.length >= 8, JSON.stringify(agentCreds));

  // Super admin adds a manager (dept required, optional reporting manager).
  r = await admin.req("POST", "/api/users", {
    name: "Cred Smoke Manager", email: MANAGER_EMAIL, role: "manager", departmentId: devDeptId,
  });
  const managerUser = r.json?.user;
  check("super admin adds manager -> 201", r.status === 201 && managerUser?.role === "manager", `status=${r.status} body=${JSON.stringify(r.json).slice(0, 200)}`);

  // Super admin adds an agent in any department (Sales, not admin's own).
  r = await admin.req("POST", "/api/users", {
    name: "Cred Smoke Sales Agent", email: `cred-smoke-sales-${STAMP}@example.com`,
    role: "team", departmentId: salesDept?._id, ticketAccess: "department",
  });
  const salesAgentUser = r.json?.user;
  check("super admin adds agent in any dept -> 201", r.status === 201 && salesAgentUser?.role === "team", `status=${r.status}`);

  // ---------- 3. Duplicate email ----------
  r = await devManager.req("POST", "/api/users", {
    name: "Dup Agent", email: AGENT_EMAIL, role: "team", departmentId: devDeptId,
  });
  check("duplicate email -> 409", r.status === 409, `status=${r.status}`);

  // ---------- 4. The new agent can actually log in ----------
  // With no SMTP, devCredentials carried the auto-generated password; log in
  // with it to prove the account works end to end.
  const newAgent = new Session();
  r = await newAgent.login(agentCreds.email, agentCreds.password);
  check("new agent logs in with emailed credentials", r.json?.user?.email === AGENT_EMAIL && r.json?.user?.role === "team", JSON.stringify(r.json));

  // Assigned-scope agents see only their own + filed tickets.
  r = await newAgent.req("GET", "/api/tickets?view=all");
  check("assigned-scope agent ticket list works", r.status === 200 && Array.isArray(r.json?.tickets), `status=${r.status}`);
  const foreign = (r.json?.tickets ?? []).filter((t) => t.assigneeId?._id !== r.json?.user?.id && t.requesterId?._id !== r.json?.user?.id && t.requesterId?._id !== undefined);
  // Strict check: nothing assigned to someone else unless the agent filed it.
  const violating = (r.json?.tickets ?? []).filter((t) => {
    const assignee = typeof t.assigneeId === "object" && t.assigneeId !== null ? t.assigneeId._id : t.assigneeId;
    const requester = typeof t.requesterId === "object" && t.requesterId !== null ? t.requesterId._id : t.requesterId;
    return assignee && assignee !== r.json?.user?.id && requester !== r.json?.user?.id;
  });
  check("assigned-scope agent sees no foreign tickets", violating.length === 0, JSON.stringify(violating.map((t) => t.ticketNumber)));

  // ---------- 5. Validation ----------
  r = await admin.req("POST", "/api/users", {
    name: "Bad", email: "not-an-email", role: "team", departmentId: devDeptId,
  });
  check("invalid email -> 400", r.status === 400, `status=${r.status}`);
  r = await admin.req("POST", "/api/users", {
    name: "Short", email: `short-pw-${STAMP}@example.com`, role: "team", departmentId: devDeptId, password: "short",
  });
  check("password < 8 chars -> 400", r.status === 400, `status=${r.status}`);

  // ---------- 6. Cleanup ----------
  const del = async (id, name) => {
    r = await admin.req("DELETE", `/api/users/${id}`);
    check(`cleanup: delete ${name}`, r.status === 200, `status=${r.status} body=${JSON.stringify(r.json)}`);
  };
  await del(salesAgentUser?._id, "sales agent");
  await del(managerUser?._id, "manager");
  await del(agentUser?._id, "agent");

  // ---------- summary ----------
  console.log(results.join("\n"));
  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
