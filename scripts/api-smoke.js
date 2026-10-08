/* Backend smoke test — exercises every API endpoint against the running server.
 * Usage: node scripts/api-smoke.js [baseUrl]
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
    const session = await this.req("GET", "/api/auth/session");
    return session;
  }
}

(async () => {
  // ---------- Unauthenticated behavior ----------
  const anon = new Session();
  let r = await anon.req("GET", "/api/tickets");
  check("unauth GET /api/tickets -> 401", r.status === 401);
  r = await anon.req("GET", "/api/users");
  check("unauth GET /api/users -> 401", r.status === 401);
  r = await anon.req("GET", "/api/stats");
  check("unauth GET /api/stats -> 401", r.status === 401);
  r = await anon.req("GET", "/api/notifications");
  check("unauth GET /api/notifications -> 401", r.status === 401);

  // ---------- Auth ----------
  const admin = new Session();
  r = await admin.login("admin@ticketing.com");
  check("admin login -> session with super_admin role", r.json?.user?.role === "super_admin", JSON.stringify(r.json));
  r = await admin.req("GET", "/api/auth/me");
  check("GET /api/auth/me -> user object", r.status === 200 && !!r.json?.user?.id);

  // ---------- Tickets CRUD ----------
  // Manager session is created up here (moved from the user-list section) so
  // the CRUD ticket is owned/editable by a manager — super admins can no
  // longer change ticket status/priority (read-only for admins).
  const mgr = new Session();
  await mgr.login("dev.manager@ticketing.com");
  // The manager's own department — baseline for cross-department denial checks.
  const me = await mgr.req("GET", "/api/auth/me");
  const mgrDeptId = me.json?.user?.departmentId;

  r = await admin.req("GET", "/api/tickets?limit=5");
  check("GET /api/tickets -> 200 + array", r.status === 200 && Array.isArray(r.json?.tickets), `status=${r.status}`);
  const seededTicket = r.json?.tickets?.[0];
  check("seeded tickets present", !!seededTicket?._id);

  r = await mgr.req("POST", "/api/tickets", {
    title: "SMOKE TEST ticket", description: "Created by api-smoke",
    category: "other", priority: "medium",
  });
  check("POST /api/tickets rejects unknown category", (await admin.req("POST", "/api/tickets", {
    title: "Bad category ticket", description: "Created by api-smoke",
    category: "bug", priority: "medium",
  })).status === 400, "legacy category should 400");
  check("POST /api/tickets (JSON) -> 201", r.status === 201 || r.status === 200, `status=${r.status} body=${JSON.stringify(r.json).slice(0, 200)}`);
  const created = r.json?.ticket;
  check("created ticket has id", !!created?._id);

  r = await admin.req("GET", `/api/tickets/${created?._id}`);
  check("GET /api/tickets/[id] -> 200 with title", r.status === 200 && r.json?.ticket?.title === "SMOKE TEST ticket");

  // Super admins get read-only status/priority (workflow fields belong to
  // managers and the working team); managers can still set them.
  r = await admin.req("PATCH", `/api/tickets/${created?._id}`, { status: "in_progress", priority: "high" });
  check("super_admin PATCH status+priority -> 403", r.status === 403, `status=${r.status} body=${JSON.stringify(r.json).slice(0, 150)}`);

  r = await mgr.req("PATCH", `/api/tickets/${created?._id}`, { status: "in_progress", priority: "high" });
  check("manager PATCH status+priority", r.status === 200 && r.json?.ticket?.status === "in_progress" && r.json?.ticket?.priority === "high", JSON.stringify(r.json).slice(0, 150));

  // invalid enum rejected
  r = await mgr.req("PATCH", `/api/tickets/${created?._id}`, { status: "bogus_status" });
  check("PATCH invalid status -> 400", r.status === 400, `status=${r.status}`);

  // ---------- Comments ----------
  // The chat is between sender + owning manager + assigned agent. The ticket
  // was filed by the manager, so they post. Super admins hold a seat in EVERY
  // conversation (2026-10 product decision) — they can read AND post; their
  // probe comment is deleted again so the thread stays clean for the checks
  // below.
  r = await admin.req("GET", `/api/tickets/${created?._id}/comments`);
  check("GET comments -> 200 array (P0 fix)", r.status === 200 && Array.isArray(r.json?.comments), `status=${r.status}`);
  r = await admin.req("POST", `/api/tickets/${created?._id}/comments`, new URLSearchParams({ body: "superadmin can post anywhere" }), true);
  check("super_admin POST comment -> 201 (participant everywhere)", r.status === 201 && !!r.json?.comment?._id, `status=${r.status}`);
  const adminCommentId = r.json?.comment?._id;
  r = await admin.req("DELETE", `/api/tickets/${created?._id}/comments/${adminCommentId}`);
  check("super_admin probe comment deleted", r.status === 200, `status=${r.status}`);
  r = await mgr.req("POST", `/api/tickets/${created?._id}/comments`, new URLSearchParams({ body: "smoke comment" }), true);
  check("POST comment (FormData) -> 200/201", r.status === 200 || r.status === 201, `status=${r.status}`);
  const comment = r.json?.comment;
  check("comment has id", !!comment?._id);
  r = await mgr.req("PATCH", `/api/tickets/${created?._id}/comments/${comment?._id}`, { body: "edited comment" });
  check("PATCH comment (edit)", r.status === 200 && r.json?.comment?.body === "edited comment", `status=${r.status}`);
  r = await mgr.req("DELETE", `/api/tickets/${created?._id}/comments/${comment?._id}`);
  check("DELETE comment", r.status === 200, `status=${r.status}`);
  r = await admin.req("GET", `/api/tickets/${created?._id}/comments`);
  // System events (kind:"system", e.g. the status change above) legitimately
  // remain in the timeline; assert no *user* messages are left.
  check("comments empty after delete", (r.json?.comments || []).filter((c) => c.kind !== "system").length === 0, JSON.stringify(r.json?.comments?.map(c => c.kind)));
  check("status change logged as system event", (r.json?.comments || []).some((c) => c.kind === "system" && /in\s?progress/.test(c.body)));

  // attachment upload via FormData
  const form = new FormData();
  form.set("title", "SMOKE FILE ticket");
  form.set("description", "with attachment");
  form.set("category", "sales");
  form.set("priority", "low");
  form.set("attachment", new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])], "test.pdf", { type: "application/pdf" }));
  r = await admin.req("POST", "/api/tickets", form, true);
  check("POST /api/tickets FormData with attachment", (r.status === 201 || r.status === 200) && !!r.json?.ticket?._id, `status=${r.status}`);
  const fileTicket = r.json?.ticket;

  // download attachment: ticket attachments persist on the ticket document
  if (fileTicket?._id) {
    r = await admin.req("GET", `/api/tickets/${fileTicket._id}`);
    const atts = r.json?.ticket?.attachments || [];
    check("FormData attachment persisted on ticket", atts.length >= 1, JSON.stringify(atts));
    check("attachment binary NOT in JSON response (bloat fix)", atts.every((a) => !("data" in a)), JSON.stringify(Object.keys(atts[0] || {})));
    check("ticket attachment has GridFS fileId", !!atts[0]?.fileId, JSON.stringify(atts[0] || {}));
    if (atts[0]?._id) {
      const res2 = await fetch(`${BASE}/api/tickets/${fileTicket._id}/attachments/${atts[0]._id}`, { headers: { cookie: admin.cookieHeader() } });
      const buf = res2.status === 200 ? Buffer.from(await res2.arrayBuffer()) : null;
      check("attachment download -> 200 + PDF magic bytes", res2.status === 200 && buf?.slice(0, 4).toString() === "%PDF", `status=${res2.status}`);
    }
    // comment attachment round-trip: post one, then download it back
    const cForm = new FormData();
    cForm.set("body", "comment with attachment");
    cForm.set("attachment", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "smoke.png", { type: "image/png" }));
    r = await admin.req("POST", `/api/tickets/${fileTicket._id}/comments`, cForm, true);
    check("POST comment with attachment -> 201", r.status === 201 && !!r.json?.comment?._id, `status=${r.status}`);
    const attachComment = r.json?.comment;
    check("comment attachment has fileId, no data", !!attachComment?.attachment?.fileId && !("data" in (attachComment.attachment || {})), JSON.stringify(attachComment?.attachment || {}));
    if (attachComment?._id && attachComment?.attachment?.fileId) {
      const res3 = await fetch(`${BASE}/api/tickets/${fileTicket._id}/attachments/${attachComment._id}`, { headers: { cookie: admin.cookieHeader() } });
      const cbuf = res3.status === 200 ? Buffer.from(await res3.arrayBuffer()) : null;
      check("comment attachment download -> 200 + PNG magic bytes", res3.status === 200 && cbuf?.slice(0, 4).toString("hex") === "89504e47", `status=${res3.status} bytes=${cbuf?.length}`);
      // cleanup so the ticket stays clean for the remaining checks
      r = await admin.req("DELETE", `/api/tickets/${fileTicket._id}/attachments/${attachComment._id}`);
      check("comment attachment DELETE -> 200", r.status === 200, `status=${r.status}`);
    }
    // comment attachment binary also stripped
    r = await admin.req("GET", `/api/tickets/${fileTicket._id}/comments`);
    check("comment attachments stripped of binary", (r.json?.comments || []).every((c) => !c.attachment || !("data" in c.attachment)));
  }

  // ---------- Users ----------
  r = await admin.req("GET", "/api/users?page=1&limit=100&role=&departmentId=&search=");
  check("GET /api/users with EMPTY filters (P0 fix)", r.status === 200 && Array.isArray(r.json?.users), `status=${r.status}`);
  r = await admin.req("GET", "/api/users");
  check("GET /api/users (no params)", r.status === 200 && r.json?.users?.length >= 10);

  // manager dept-scope IDOR check (mgr session was logged in earlier, before
  // the tickets CRUD section — see the top of that section)
  r = await mgr.req("GET", "/api/users?limit=100");
  const mgrUsers = r.json?.users || [];
  const allInOneDept = mgrUsers.every((u) => !u.departmentId || String(u.departmentId?._id || u.departmentId) === String(mgrUsers[0].departmentId?._id || mgrUsers[0].departmentId || ""));
  check("manager user-list scoped to own dept (IDOR fix)", r.status === 200 && allInOneDept, JSON.stringify(mgrUsers.slice(0, 3).map((u) => u.departmentId)));

  // client role blocked from user list
  const client = new Session();
  await client.login("client1@example.com");
  r = await client.req("GET", "/api/users");
  check("client GET /api/users -> 403/401", r.status === 403 || r.status === 401, `status=${r.status}`);
  r = await client.req("GET", "/api/tickets");
  check("client sees only own tickets", r.status === 200 && (r.json?.tickets || []).every((t) => t.requesterId?.email === "client1@example.com" || !t.requesterId?.email), `count=${r.json?.tickets?.length}`);

  // ---------- Departments ----------
  r = await admin.req("GET", "/api/departments");
  check("GET /api/departments", r.status === 200 && r.json?.departments?.length >= 3);
  r = await client.req("GET", "/api/departments");
  check("client GET /api/departments -> 403/401", r.status === 403 || r.status === 401, `status=${r.status}`);

  // ---------- Stats ----------
  r = await admin.req("GET", "/api/stats");
  check("GET /api/stats -> overview counters", r.status === 200 && typeof r.json?.overview?.open === "number", JSON.stringify(r.json).slice(0, 150));

  // ---------- Routing ----------
  r = await admin.req("GET", "/api/routing/rules");
  check("GET /api/routing/rules -> 6 seeded", r.status === 200 && r.json?.rules?.length >= 6, `count=${r.json?.rules?.length}`);
  const ruleId = r.json?.rules?.[0]?._id;
  const beforeStats = r.json?.rules?.[0]?.stats?.matchCount;

  r = await admin.req("GET", "/api/routing/agents");
  check("GET /api/routing/agents", r.status === 200 && r.json?.agents?.length >= 1);
  r = await mgr.req("GET", "/api/routing/agents");
  const mgrAgentDepts = (r.json?.departments || []).map((d) => String(d._id));
  check("manager /api/routing/agents dept-scoped", r.status === 200 && mgrAgentDepts.length <= 1, JSON.stringify(mgrAgentDepts));

  // preview must be a dry run (no stat bump)
  r = await admin.req("POST", "/api/routing/preview", {
    title: "login broken urgent bug", description: "cannot login, urgent bug",
    category: "bug", priority: "urgent",
  });
  check("POST /api/routing/preview", r.status === 200 && !!r.json?.decision, `status=${r.status}`);
  r = await admin.req("GET", "/api/routing/rules");
  const afterStats = (r.json?.rules || []).find((x) => x._id === ruleId)?.stats?.matchCount;
  check("preview did NOT bump rule stats (dryRun fix)", beforeStats === afterStats, `before=${beforeStats} after=${afterStats}`);

  // real creation SHOULD bump stats if a rule matches — create urgent bug ticket
  r = await admin.req("POST", "/api/tickets", { title: "urgent bug cannot login", description: "urgent bug", category: "development", priority: "urgent" });
  const routed = r.json?.ticket;
  check("urgent bug ticket created (routing may assign)", !!routed?._id);
  r = await admin.req("GET", "/api/routing/rules");
  const afterReal = (r.json?.rules || []).find((x) => x._id === ruleId)?.stats?.matchCount;
  check("real match DID bump stats", afterReal > beforeStats, `before=${beforeStats} after=${afterReal}`);

  // ---------- Notifications ----------
  r = await admin.req("GET", "/api/notifications");
  check("GET /api/notifications", r.status === 200 && Array.isArray(r.json?.notifications));
  r = await admin.req("GET", "/api/notifications?all=1");
  check("GET /api/notifications?all=1", r.status === 200);
  // client got notifications from ticket creation? check client list + read-all + delete flow on any notif
  r = await client.req("GET", "/api/notifications");
  const clientNotifs = r.json?.notifications || [];
  check("client GET /api/notifications", r.status === 200);
  if (clientNotifs.length > 0) {
    const nid = clientNotifs[0].id;
    r = await client.req("PATCH", `/api/notifications/${nid}`);
    check("PATCH notification mark-read", r.status === 200, `status=${r.status}`);
    r = await client.req("DELETE", `/api/notifications/${nid}`);
    check("DELETE notification", r.status === 200, `status=${r.status}`);
  }
  r = await client.req("POST", "/api/notifications/read-all");
  check("POST /api/notifications/read-all", r.status === 200, `status=${r.status}`);

  // client cannot touch another user's notification (IDOR)
  r = await client.req("PATCH", `/api/notifications/${"0".repeat(24)}`);
  check("client PATCH nonexistent notification -> 404", r.status === 404, `status=${r.status}`);

  // ---------- Assignment & forward permission model ----------
  // New model: managers assign within their department; super admins can
  // only FORWARD an unassigned ticket to a manager (never pick agents), and
  // may unassign as oversight. The old flow (admin assigns an agent, then
  // unassigns) is replaced by these role-specific checks.
  if (routed?._id) {
    // routed was auto-assigned to the Dev Manager by the routing engine's
    // fallbackAssignee. Unassign first so the forward path can be exercised.
    r = await admin.req("PATCH", `/api/tickets/${routed._id}`, { assigneeId: null });
    check("PATCH assigneeId null (unassign fix)", r.status === 200 && r.json?.ticket?.assigneeId == null, JSON.stringify(r.json?.ticket?.assigneeId));

    // super_admin cannot assign an AGENT anymore
    r = await admin.req("GET", "/api/routing/agents");
    const anAgent = (r.json?.agents || []).find((a) => a.role === "team");
    if (anAgent) {
      r = await admin.req("PATCH", `/api/tickets/${routed._id}`, { assigneeId: anAgent._id || anAgent.userId });
      check("super_admin PATCH assigneeId=agent -> 403 (forward-only model)", r.status === 403, `status=${r.status}`);
    }

    // super_admin CAN forward an unassigned ticket to a manager. Target the
    // DEV manager (the "mgr" session) so the visibility + reassignment
    // checks below reuse that session instead of burning extra logins
    // (auth endpoints are rate-limited to 15 hits/min per IP).
    r = await admin.req("GET", "/api/users?role=manager&limit=100");
    const aManager =
      (r.json?.users || []).find((u) => u.email === "dev.manager@ticketing.com") ||
      (r.json?.users || []).find((u) => u.departmentId);
    if (aManager) {
      r = await admin.req("PATCH", `/api/tickets/${routed._id}`, { assigneeId: aManager._id });
      check("super_admin forward unassigned -> manager -> 200", r.status === 200 && r.json?.ticket?.assigneeId?._id === aManager._id, `status=${r.status} body=${JSON.stringify(r.json).slice(0, 150)}`);
      check("forward routes ticket into manager's department", !!r.json?.ticket?.departmentId, `dept=${JSON.stringify(r.json?.ticket?.departmentId)}`);
      // the forwarded manager sees it on their dashboard (mgr session == dev manager)
      const seen = await mgr.req("GET", "/api/tickets?limit=100");
      check("forwarded ticket visible on manager dashboard", (seen.json?.tickets || []).some((t) => t._id === routed._id), `count=${seen.json?.tickets?.length}`);
    }

    // manager assigns their own team member, then unassigns again
    r = await mgr.req("GET", "/api/users?role=team&limit=100");
    const deptAgent = (r.json?.users || []).find((u) => u.role === "team");
    if (deptAgent) {
      r = await mgr.req("PATCH", `/api/tickets/${routed._id}`, { assigneeId: deptAgent._id });
      check("manager assigns own-department agent -> 200", r.status === 200 && r.json?.ticket?.assigneeId?._id === deptAgent._id, `status=${r.status} body=${JSON.stringify(r.json).slice(0, 120)}`);
      r = await mgr.req("PATCH", `/api/tickets/${routed._id}`, { assigneeId: null });
      check("manager unassign -> 200", r.status === 200 && r.json?.ticket?.assigneeId == null, `status=${r.status}`);
    }
    // manager cannot assign outside their department: pick any team user NOT
    // in the manager's own department (admin list is org-wide).
    r = await admin.req("GET", "/api/users?role=team&limit=100");
    const foreignAgent = (r.json?.users || []).find((u) => String(u.departmentId?._id || u.departmentId || "") !== String(mgrDeptId || ""));
    if (foreignAgent) {
      r = await mgr.req("PATCH", `/api/tickets/${routed._id}`, { assigneeId: foreignAgent._id });
      check("manager cross-department assign -> 403", r.status === 403, `status=${r.status}`);
    }

    // ticket delete
    r = await admin.req("DELETE", `/api/tickets/${routed._id}`);
    check("DELETE /api/tickets/[id]", r.status === 200, `status=${r.status}`);
    r = await admin.req("GET", `/api/tickets/${routed._id}`);
    check("deleted ticket -> 404", r.status === 404);
  }
  // full-text search (text index): token match, exact ticket number, miss
  r = await admin.req("GET", `/api/tickets?search=smoke`);
  check("search 'smoke' finds the smoke ticket (text index)", r.status === 200 && (r.json?.tickets || []).some((t) => t._id === fileTicket._id), `status=${r.status} count=${r.json?.tickets?.length}`);
  r = await admin.req("GET", `/api/tickets?search=${fileTicket.ticketNumber}`);
  check("search by exact ticket number finds it", r.status === 200 && (r.json?.tickets || []).some((t) => t._id === fileTicket._id), `status=${r.status} tn=${fileTicket.ticketNumber}`);
  r = await admin.req("GET", `/api/tickets?search=zzqxjwwvvnotfound`);
  check("garbage search returns empty, no crash", r.status === 200 && (r.json?.tickets || []).length === 0, `status=${r.status}`);

  if (fileTicket?._id) {
    r = await admin.req("DELETE", `/api/tickets/${fileTicket._id}`);
    check("cleanup file ticket", r.status === 200, `status=${r.status}`);
  }
  if (created?._id) {
    r = await admin.req("DELETE", `/api/tickets/${created._id}`);
    check("cleanup created ticket", r.status === 200, `status=${r.status}`);
  }

  // ---------- Password reset ----------
  r = await anon.req("POST", "/api/auth/reset", { email: "client1@example.com" });
  check("POST /api/auth/reset -> message (+devResetUrl when no SMTP)", r.status === 200 && !!r.json?.message, JSON.stringify(r.json).slice(0, 150));
  const devUrl = r.json?.devResetUrl;
  if (devUrl) {
    // devResetUrl is the page URL (/reset-password/<token>); the API lives at
    // /api/auth/reset/<token>, so take the token from the tail.
    r = await anon.req("POST", `/api/auth/reset/${devUrl.split("/").pop()}`, { password: "NewPass123!xyz" });
    check("POST /api/auth/reset/[token] sets new password", r.status === 200, `status=${r.status}`);
    // restore original password for repeat runs
    const s2 = new Session();
    const lg = await s2.req("POST", "/api/auth/reset", { email: "client1@example.com" });
    if (lg.json?.devResetUrl) {
      await s2.req("POST", `/api/auth/reset/${lg.json.devResetUrl.split("/").pop()}`, { password: PASSWORD });
    }
  }

  console.log(results.join("\n"));
  console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
