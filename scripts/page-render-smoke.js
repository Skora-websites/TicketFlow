/* Page-render smoke: logs in via cookie jar, fetches key pages, checks for
 * SSR crash markers. Usage: node scripts/page-render-smoke.js [baseUrl]
 * Exits non-zero on any failure. */
const BASE = process.argv[2] || "http://localhost:3000";
const PASSWORD = "wBDWlqZk9uLIA1!";

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
  header() { return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; "); }
  async req(method, path, body, isForm) {
    const headers = { cookie: this.header() };
    let payload;
    if (isForm) payload = body;
    else if (body !== undefined) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
    const res = await fetch(BASE + path, { method, headers, body: payload, redirect: "manual" });
    this.absorb(res);
    return res;
  }
  async login(email) {
    const csrfRes = await this.req("GET", "/api/auth/csrf");
    const { csrfToken } = await csrfRes.json();
    const loginRes = await this.req("POST", "/api/auth/callback/credentials",
      new URLSearchParams({ csrfToken, email, password: PASSWORD }), true);
    if (loginRes.status === 429) throw new Error("rate limited — wait a minute and retry");
    if ((loginRes.headers.get("location") || "").includes("error=")) {
      throw new Error("login rejected: " + loginRes.headers.get("location"));
    }
    const sessionRes = await this.req("GET", "/api/auth/session");
    const session = await sessionRes.json();
    if (!session?.user?.role) throw new Error("no session after login");
    return session;
  }
}

(async () => {
  const s = new Session();
  const session = await s.login("admin@ticketing.com");
  console.log("session:", session.user.role);

  const ticketsRes = await s.req("GET", "/api/tickets?limit=1");
  const ticketsJson = await ticketsRes.json();
  if (!ticketsJson?.tickets?.length) throw new Error("no tickets visible to admin");
  const ticketId = ticketsJson.tickets[0]._id;

  let fails = 0;
  const pages = [
    "/dashboard/overview",
    "/dashboard/tickets",
    `/dashboard/tickets/${ticketId}`,
    "/dashboard/users",
    "/dashboard/routing",
    "/dashboard/notifications",
  ];
  for (const p of pages) {
    const res = await s.req("GET", p);
    const text = await res.text();
    const crashed = /Application error|reading 'split'|missing required error components/i.test(text);
    if (crashed || res.status !== 200) fails++;
    console.log(`${crashed || res.status !== 200 ? "FAIL" : "PASS"}  ${p} -> ${res.status}${crashed ? " (crash marker)" : ""}`);
  }
  console.log(`\n${pages.length - fails}/${pages.length} pages ok`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
