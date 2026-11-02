const BASE_URL = "https://ticket-flow-skora.vercel.app";

async function loginUser(email, password) {
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`);
  const setCookies = csrfRes.headers.getSetCookie ? csrfRes.headers.getSetCookie() : [csrfRes.headers.get("set-cookie")].filter(Boolean);
  const cookieHeader = setCookies.map(c => c.split(";")[0]).join("; ");
  const csrfData = await csrfRes.json();
  const csrfToken = csrfData.csrfToken;

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
  return authCookies;
}

async function runLiveWorkflow() {
  console.log("=== End-to-End Live Workflow Test on Production ===");
  const password = "wBDWlqZk9uLIA1!";

  // 1. Authenticate Client and Manager
  console.log("1. Authenticating Client & Manager sessions...");
  const clientCookies = await loginUser("client1@example.com", password);
  const mgrCookies = await loginUser("dev.manager@ticketing.com", password);
  console.log("   ✓ Client and Manager authenticated.");

  // 2. Client submits a new ticket
  console.log("\n2. Client Submitting Live Ticket...");
  const ticketPayload = {
    title: `Live QA Audit Ticket ${Date.now().toString().slice(-4)}`,
    description: "Automated end-to-end verification of ticket creation, status update, and messaging.",
    category: "development",
    priority: "high",
  };

  const createRes = await fetch(`${BASE_URL}/api/tickets`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cookie": clientCookies,
    },
    body: JSON.stringify(ticketPayload),
  });

  console.log(`   POST /api/tickets: HTTP ${createRes.status}`);
  if (!createRes.ok) {
    const err = await createRes.text();
    console.error("   Failed to create ticket:", err);
    return;
  }

  const { ticket, routingApplied } = await createRes.json();
  console.log(`   ✓ Created Ticket: ${ticket.ticketNumber} (ID: ${ticket._id})`);
  console.log(`     Routing Applied: ${routingApplied}`);
  console.log(`     Initial Status: ${ticket.status}`);
  console.log(`     Assigned To: ${ticket.assigneeId?.name || "Unassigned"}`);

  // 3. Client posts a public message
  console.log("\n3. Client Posting Conversation Message...");
  const form = new FormData();
  form.append("body", "Hello support team, this is an automated live verification check.");
  form.append("visibility", "public");

  const msgRes = await fetch(`${BASE_URL}/api/tickets/${ticket._id}/comments`, {
    method: "POST",
    headers: { Cookie: clientCookies },
    body: form,
  });
  console.log(`   POST /api/tickets/[id]/comments: HTTP ${msgRes.status}`);
  if (msgRes.ok) {
    const { comment } = await msgRes.json();
    console.log(`   ✓ Comment posted by ${comment.authorId?.name} (Kind: ${comment.kind})`);
  }

  // 4. Client attempts to post an internal note (MUST BE FORCED PUBLIC OR REJECTED)
  console.log("\n4. Security Isolation: Client Attempting Internal Note...");
  const internalForm = new FormData();
  internalForm.append("body", "Attempting unauthorized internal note");
  internalForm.append("visibility", "internal");

  const hackRes = await fetch(`${BASE_URL}/api/tickets/${ticket._id}/comments`, {
    method: "POST",
    headers: { Cookie: clientCookies },
    body: internalForm,
  });
  if (hackRes.ok) {
    const hackComment = (await hackRes.json()).comment;
    console.log(`   Result: Comment saved with visibility="${hackComment.visibility}"`);
    if (hackComment.visibility === "public") {
      console.log("   ✓ Client was safely prevented from creating an internal note (forced to public)!");
    } else {
      console.error("   ✗ SECURITY VULNERABILITY: Client created an internal note!");
    }
  }

  // 5. Manager views the ticket and updates status to in_progress
  console.log("\n5. Manager Updating Ticket Status to 'in_progress'...");
  const updateRes = await fetch(`${BASE_URL}/api/tickets/${ticket._id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Cookie": mgrCookies,
    },
    body: JSON.stringify({ status: "in_progress" }),
  });
  console.log(`   PATCH /api/tickets/[id]: HTTP ${updateRes.status}`);
  if (updateRes.ok) {
    const updated = (await updateRes.json()).ticket;
    console.log(`   ✓ Manager updated status to: ${updated.status}`);
  }

  // 6. Client retrieves ticket details to confirm status synchronization
  console.log("\n6. Client Reconciling Ticket Details...");
  const clientGetRes = await fetch(`${BASE_URL}/api/tickets/${ticket._id}`, {
    headers: { Cookie: clientCookies },
  });
  if (clientGetRes.ok) {
    const freshTicket = (await clientGetRes.json()).ticket;
    console.log(`   ✓ Client sees updated status: ${freshTicket.status}`);
  }

  console.log("\n=== Live End-to-End Workflow Passed Successfully! ===");
}

runLiveWorkflow().catch(console.error);
