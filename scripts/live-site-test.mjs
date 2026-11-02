const BASE_URL = "https://ticket-flow-skora.vercel.app";

console.log(`Starting Live Site Audit on: ${BASE_URL}\n`);

async function testPublicEndpoints() {
  console.log("=== 1. Public Pages & Health Probes ===");

  // Health endpoint
  try {
    const healthRes = await fetch(`${BASE_URL}/api/health`);
    console.log(`- GET /api/health: HTTP ${healthRes.status}`);
    if (healthRes.ok) {
      const data = await healthRes.json().catch(() => ({}));
      console.log(`  Health response:`, data);
    }
  } catch (err) {
    console.log(`- GET /api/health: Error - ${err.message}`);
  }

  // Root landing
  const rootRes = await fetch(`${BASE_URL}/`, { redirect: "manual" });
  console.log(`- GET /: HTTP ${rootRes.status} (Location: ${rootRes.headers.get("location") || "none"})`);

  // Login page
  const loginRes = await fetch(`${BASE_URL}/login`);
  console.log(`- GET /login: HTTP ${loginRes.status}`);

  // Signup page
  const signupRes = await fetch(`${BASE_URL}/signup`);
  console.log(`- GET /signup: HTTP ${signupRes.status}`);

  // Unauthorized page
  const unauthRes = await fetch(`${BASE_URL}/unauthorized`);
  console.log(`- GET /unauthorized: HTTP ${unauthRes.status}`);
}

async function testUnauthenticatedProtection() {
  console.log("\n=== 2. Unauthenticated Protected Route Verification ===");

  const apiTickets = await fetch(`${BASE_URL}/api/tickets`);
  console.log(`- GET /api/tickets (no auth): HTTP ${apiTickets.status} (Expected 401)`);

  const apiUsers = await fetch(`${BASE_URL}/api/users`);
  console.log(`- GET /api/users (no auth): HTTP ${apiUsers.status} (Expected 401)`);

  const dashRes = await fetch(`${BASE_URL}/dashboard/overview`, { redirect: "manual" });
  console.log(`- GET /dashboard/overview (no auth): HTTP ${dashRes.status} (Location: ${dashRes.headers.get("location") || "none"})`);

  const clientRes = await fetch(`${BASE_URL}/client/tickets`, { redirect: "manual" });
  console.log(`- GET /client/tickets (no auth): HTTP ${clientRes.status} (Location: ${clientRes.headers.get("location") || "none"})`);
}

async function loginUser(email, password) {
  // 1. Get CSRF token
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`);
  const setCookies = csrfRes.headers.getSetCookie ? csrfRes.headers.getSetCookie() : [csrfRes.headers.get("set-cookie")].filter(Boolean);
  const cookieHeader = setCookies.map(c => c.split(";")[0]).join("; ");
  const csrfData = await csrfRes.json();
  const csrfToken = csrfData.csrfToken;

  // 2. Submit credentials
  const body = new URLSearchParams({
    csrfToken,
    email,
    password,
    redirect: "false",
    callbackUrl: `${BASE_URL}/`,
  });

  const loginRes = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cookie": cookieHeader,
    },
    body: body.toString(),
    redirect: "manual",
  });

  const authSetCookies = loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : [loginRes.headers.get("set-cookie")].filter(Boolean);
  const authCookies = [...setCookies, ...authSetCookies].map(c => c.split(";")[0]).join("; ");

  return {
    status: loginRes.status,
    cookies: authCookies,
    location: loginRes.headers.get("location"),
  };
}

async function testAuthenticationAndRoles() {
  console.log("\n=== 3. Live Persona Authentication & RBAC ===");

  const personas = [
    { name: "Super Admin", email: "admin@ticketing.com", role: "super_admin" },
    { name: "Dev Manager", email: "dev.manager@ticketing.com", role: "manager" },
    { name: "Dev Agent", email: "dev1@ticketing.com", role: "team" },
    { name: "Client", email: "client1@example.com", role: "client" },
  ];

  const password = "wBDWlqZk9uLIA1!";
  const sessions = {};

  for (const p of personas) {
    try {
      const auth = await loginUser(p.email, password);
      console.log(`- Login ${p.name} (${p.email}): Status ${auth.status}`);
      if (auth.cookies.includes("session-token")) {
        console.log(`  ✓ Session cookie received for ${p.name}`);
        sessions[p.role] = auth.cookies;
      } else {
        console.log(`  ✗ No session token received. (Location: ${auth.location})`);
      }
    } catch (err) {
      console.log(`  ✗ Login error for ${p.name}: ${err.message}`);
    }
  }

  // Test authenticated endpoints with sessions
  if (sessions.client) {
    console.log("\n=== 4. Client Isolation Verification ===");
    const clientCookies = sessions.client;

    // Client fetching tickets
    const clientTicketsRes = await fetch(`${BASE_URL}/api/tickets`, {
      headers: { Cookie: clientCookies },
    });
    console.log(`- Client GET /api/tickets: HTTP ${clientTicketsRes.status}`);
    if (clientTicketsRes.ok) {
      const ticketsData = await clientTicketsRes.json();
      console.log(`  Client sees ${ticketsData.tickets?.length ?? 0} ticket(s)`);
    }

    // Client attempting to access staff users list -> MUST BE 403
    const clientUsersRes = await fetch(`${BASE_URL}/api/users`, {
      headers: { Cookie: clientCookies },
    });
    console.log(`- Client GET /api/users: HTTP ${clientUsersRes.status} (Expected 403 Forbidden)`);

    // Client attempting to access routing preview -> MUST BE 403
    const clientRoutingRes = await fetch(`${BASE_URL}/api/routing/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: clientCookies },
      body: JSON.stringify({ title: "Test", description: "Test issue description", category: "other" }),
    });
    console.log(`- Client POST /api/routing/preview: HTTP ${clientRoutingRes.status} (Expected 403 Forbidden)`);
  }

  if (sessions.manager) {
    console.log("\n=== 5. Manager Operational Capabilities ===");
    const mgrCookies = sessions.manager;

    const mgrTicketsRes = await fetch(`${BASE_URL}/api/tickets`, {
      headers: { Cookie: mgrCookies },
    });
    console.log(`- Manager GET /api/tickets: HTTP ${mgrTicketsRes.status}`);

    const mgrUsersRes = await fetch(`${BASE_URL}/api/users`, {
      headers: { Cookie: mgrCookies },
    });
    console.log(`- Manager GET /api/users: HTTP ${mgrUsersRes.status}`);
    if (mgrUsersRes.ok) {
      const usersData = await mgrUsersRes.json();
      console.log(`  Manager sees ${usersData.users?.length ?? 0} team member(s)`);
    }

    const mgrStatsRes = await fetch(`${BASE_URL}/api/stats`, {
      headers: { Cookie: mgrCookies },
    });
    console.log(`- Manager GET /api/stats: HTTP ${mgrStatsRes.status}`);
    if (mgrStatsRes.ok) {
      const statsData = await mgrStatsRes.json();
      console.log(`  Total tickets in stats: ${statsData.overview?.total ?? 0}`);
    }
  }

  if (sessions.super_admin) {
    console.log("\n=== 6. Super Admin Governance Capabilities ===");
    const adminCookies = sessions.super_admin;

    const deptsRes = await fetch(`${BASE_URL}/api/departments`, {
      headers: { Cookie: adminCookies },
    });
    console.log(`- Super Admin GET /api/departments: HTTP ${deptsRes.status}`);
    if (deptsRes.ok) {
      const depts = await deptsRes.json();
      console.log(`  Departments count: ${depts.departments?.length ?? 0}`);
    }

    const rulesRes = await fetch(`${BASE_URL}/api/routing/rules`, {
      headers: { Cookie: adminCookies },
    });
    console.log(`- Super Admin GET /api/routing/rules: HTTP ${rulesRes.status}`);
    if (rulesRes.ok) {
      const rules = await rulesRes.json();
      console.log(`  Routing rules count: ${rules.rules?.length ?? 0}`);
    }
  }
}

async function run() {
  try {
    await testPublicEndpoints();
    await testUnauthenticatedProtection();
    await testAuthenticationAndRoles();
    console.log("\nLive site audit script finished successfully!");
  } catch (err) {
    console.error("Live test failed with unhandled error:", err);
  }
}

run();
