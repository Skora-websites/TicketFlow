import "server-only";
import { connectDB } from "@/lib/db/mongo";
import { User, Department, Ticket, Comment, RoutingRule, AgentAvailability, Category } from "@/lib/db/models";
import { hashPassword } from "@/lib/password";
import { DEFAULT_CATEGORY_SEEDS } from "@/lib/categories";
import mongoose from "mongoose";

// Shared demo password for seeded users. Override via SEED_DEMO_PASSWORD.
const DEFAULT_DEMO_PASSWORD = "wBDWlqZk9uLIA1!";

export async function seed() {
  await connectDB();
  console.log("Seeding database...");

  const departments = await Promise.all([
    Department.findOneAndUpdate(
      { name: "Development" },
      { name: "Development", color: "#4F46E5", description: "Software development team" },
      { upsert: true, returnDocument: "after" }
    ),
    Department.findOneAndUpdate(
      { name: "Marketing" },
      { name: "Marketing", color: "#EC4899", description: "Marketing and communications" },
      { upsert: true, returnDocument: "after" }
    ),
    Department.findOneAndUpdate(
      { name: "Sales" },
      { name: "Sales", color: "#10B981", description: "Sales and business development" },
      { upsert: true, returnDocument: "after" }
    ),
  ]);

  const [devDept, marketingDept, salesDept] = departments;

  // ---- Categories (dynamic; shared by client + agent tickets) ----
  const categoryDocs = await Promise.all(
    DEFAULT_CATEGORY_SEEDS.map((c) =>
      Category.findOneAndUpdate({ slug: c.slug }, c, { upsert: true, returnDocument: "after" })
    )
  );
  const seedCategory = {
    development: categoryDocs.find((c) => c?.slug === "development")?.slug ?? "development",
    marketing: categoryDocs.find((c) => c?.slug === "marketing")?.slug ?? "marketing",
    sales: categoryDocs.find((c) => c?.slug === "sales")?.slug ?? "sales",
    other: categoryDocs.find((c) => c?.slug === "other")?.slug ?? "other",
  };
  void seedCategory;

  const demoPassword = process.env.SEED_DEMO_PASSWORD || DEFAULT_DEMO_PASSWORD;
  const passwordHash = await hashPassword(demoPassword);
  console.log(`\n=== Seeded demo password (all users): ${demoPassword} ===\n`);

  const users = await Promise.all([
    User.findOneAndUpdate(
      { email: "admin@ticketing.com" },
      {
        name: "Super Admin",
        email: "admin@ticketing.com",
        passwordHash,
        role: "super_admin",
        active: true,
      },
      { upsert: true, returnDocument: "after" }
    ),
    User.findOneAndUpdate(
      { email: "dev.manager@ticketing.com" },
      {
        name: "Dev Manager",
        email: "dev.manager@ticketing.com",
        passwordHash,
        role: "manager",
        departmentId: devDept._id,
        active: true,
      },
      { upsert: true, returnDocument: "after" }
    ),
    User.findOneAndUpdate(
      { email: "marketing.manager@ticketing.com" },
      {
        name: "Marketing Manager",
        email: "marketing.manager@ticketing.com",
        passwordHash,
        role: "manager",
        departmentId: marketingDept._id,
        active: true,
      },
      { upsert: true, returnDocument: "after" }
    ),
    User.findOneAndUpdate(
      { email: "sales.manager@ticketing.com" },
      {
        name: "Sales Manager",
        email: "sales.manager@ticketing.com",
        passwordHash,
        role: "manager",
        departmentId: salesDept._id,
        active: true,
      },
      { upsert: true, returnDocument: "after" }
    ),
    User.findOneAndUpdate(
      { email: "dev1@ticketing.com" },
      {
        name: "Alex Developer",
        email: "dev1@ticketing.com",
        passwordHash,
        role: "team",
        departmentId: devDept._id,
        active: true,
      },
      { upsert: true, returnDocument: "after" }
    ),
    User.findOneAndUpdate(
      { email: "dev2@ticketing.com" },
      {
        name: "Jordan Coder",
        email: "dev2@ticketing.com",
        passwordHash,
        role: "team",
        departmentId: devDept._id,
        active: true,
      },
      { upsert: true, returnDocument: "after" }
    ),
    User.findOneAndUpdate(
      { email: "marketing1@ticketing.com" },
      {
        name: "Taylor Marketer",
        email: "marketing1@ticketing.com",
        passwordHash,
        role: "team",
        departmentId: marketingDept._id,
        active: true,
      },
      { upsert: true, returnDocument: "after" }
    ),
    User.findOneAndUpdate(
      { email: "marketing2@ticketing.com" },
      {
        name: "Casey Creative",
        email: "marketing2@ticketing.com",
        passwordHash,
        role: "team",
        departmentId: marketingDept._id,
        active: true,
      },
      { upsert: true, returnDocument: "after" }
    ),
    User.findOneAndUpdate(
      { email: "sales1@ticketing.com" },
      {
        name: "Morgan Seller",
        email: "sales1@ticketing.com",
        passwordHash,
        role: "team",
        departmentId: salesDept._id,
        active: true,
      },
      { upsert: true, returnDocument: "after" }
    ),
    User.findOneAndUpdate(
      { email: "sales2@ticketing.com" },
      {
        name: "Riley Closer",
        email: "sales2@ticketing.com",
        passwordHash,
        role: "team",
        departmentId: salesDept._id,
        active: true,
      },
      { upsert: true, returnDocument: "after" }
    ),
    User.findOneAndUpdate(
      { email: "client1@example.com" },
      {
        name: "John Client",
        email: "client1@example.com",
        passwordHash,
        role: "client",
        active: true,
      },
      { upsert: true, returnDocument: "after" }
    ),
    User.findOneAndUpdate(
      { email: "client2@example.com" },
      {
        name: "Jane Customer",
        email: "client2@example.com",
        passwordHash,
        role: "client",
        active: true,
      },
      { upsert: true, returnDocument: "after" }
    ),
  ]);

  const [admin, devManager, marketingManager, salesManager, dev1, dev2, marketing1, marketing2, sales1, sales2, client1, client2] = users;

  let ticketCounter = 1;
  function nextTicketNumber() {
    return `TK-${String(ticketCounter++).padStart(4, "0")}`;
  }

  const ticketsData = [
    {
      ticketNumber: nextTicketNumber(),
      title: "Login page not loading on mobile",
      description: "Users report the login page shows a blank screen on iOS Safari. Works fine on desktop.",
      category: "development" as const,
      priority: "high" as const,
      status: "open" as const,
      requesterId: client1._id,
      departmentId: devDept._id,
      assigneeId: dev1._id,
      assignedBy: devManager._id,
    },
    {
      ticketNumber: nextTicketNumber(),
      title: "Add dark mode toggle to settings",
      description: "Feature request to add a dark/light mode toggle in user settings panel.",
      category: "marketing" as const,
      priority: "medium" as const,
      status: "in_progress" as const,
      requesterId: client1._id,
      departmentId: devDept._id,
      assigneeId: dev2._id,
      assignedBy: devManager._id,
    },
    {
      ticketNumber: nextTicketNumber(),
      title: "Email notifications not sending",
      description: "Ticket assignment emails are not being sent to team members.",
      category: "development" as const,
      priority: "urgent" as const,
      status: "on_hold" as const,
      requesterId: dev1._id,
      departmentId: devDept._id,
      assigneeId: dev1._id,
      assignedBy: devManager._id,
    },
    {
      ticketNumber: nextTicketNumber(),
      title: "Marketing campaign landing page",
      description: "Need a new landing page for Q4 marketing campaign with lead capture form.",
      category: "marketing" as const,
      priority: "high" as const,
      status: "resolved" as const,
      requesterId: client2._id,
      departmentId: marketingDept._id,
      assigneeId: marketing1._id,
      assignedBy: marketingManager._id,
    },
    {
      ticketNumber: nextTicketNumber(),
      title: "Social media integration broken",
      description: "Twitter/X API integration returning 403 errors when posting updates.",
      category: "development" as const,
      priority: "medium" as const,
      status: "closed" as const,
      requesterId: marketing2._id,
      departmentId: marketingDept._id,
      assigneeId: marketing2._id,
      assignedBy: marketingManager._id,
      closedAt: new Date(),
    },
    {
      ticketNumber: nextTicketNumber(),
      title: "CRM data sync issues",
      description: "Salesforce sync failing for contacts updated in the last 24 hours.",
      category: "other" as const,
      priority: "high" as const,
      status: "open" as const,
      requesterId: sales1._id,
      departmentId: salesDept._id,
      assigneeId: sales1._id,
      assignedBy: salesManager._id,
    },
    {
      ticketNumber: nextTicketNumber(),
      title: "New lead scoring model",
      description: "Implement predictive lead scoring based on engagement metrics.",
      category: "marketing" as const,
      priority: "medium" as const,
      status: "in_progress" as const,
      requesterId: salesManager._id,
      departmentId: salesDept._id,
      assigneeId: sales2._id,
      assignedBy: salesManager._id,
    },
    {
      ticketNumber: nextTicketNumber(),
      title: "Invoice generation failing",
      description: "PDF invoices not generating for completed deals in EUR currency.",
      category: "development" as const,
      priority: "urgent" as const,
      status: "open" as const,
      requesterId: client2._id,
      departmentId: salesDept._id,
    },
    {
      ticketNumber: nextTicketNumber(),
      title: "API rate limiting too aggressive",
      description: "Third-party API rate limits causing failures during peak hours.",
      category: "other" as const,
      priority: "medium" as const,
      status: "in_progress" as const,
      requesterId: dev1._id,
      departmentId: devDept._id,
      assigneeId: dev1._id,
      assignedBy: devManager._id,
    },
    {
      ticketNumber: nextTicketNumber(),
      title: "Dashboard metrics incorrect",
      description: "Monthly revenue numbers don't match finance reports.",
      category: "development" as const,
      priority: "high" as const,
      status: "resolved" as const,
      requesterId: salesManager._id,
      departmentId: salesDept._id,
      assigneeId: sales1._id,
      assignedBy: salesManager._id,
    },
    {
      ticketNumber: nextTicketNumber(),
      title: "Brand guidelines update",
      description: "Update all templates with new brand colors and logo variations.",
      category: "marketing" as const,
      priority: "low" as const,
      status: "open" as const,
      requesterId: marketingManager._id,
      departmentId: marketingDept._id,
    },
    {
      ticketNumber: nextTicketNumber(),
      title: "Mobile app crash on checkout",
      description: "React Native app crashes when processing payments on Android 14.",
      category: "development" as const,
      priority: "urgent" as const,
      status: "on_hold" as const,
      requesterId: client1._id,
      departmentId: devDept._id,
      assigneeId: dev2._id,
      assignedBy: devManager._id,
    },
    {
      ticketNumber: nextTicketNumber(),
      title: "Export to CSV feature",
      description: "Add CSV export for ticket lists with customizable columns.",
      category: "marketing" as const,
      priority: "medium" as const,
      status: "open" as const,
      requesterId: devManager._id,
      departmentId: devDept._id,
    },
    {
      ticketNumber: nextTicketNumber(),
      title: "Email template editor",
      description: "Visual editor for transactional email templates.",
      category: "marketing" as const,
      priority: "low" as const,
      status: "open" as const,
      requesterId: marketing1._id,
      departmentId: marketingDept._id,
    },
    {
      ticketNumber: nextTicketNumber(),
      title: "Two-factor authentication",
      description: "Add 2FA option for all user accounts.",
      category: "marketing" as const,
      priority: "high" as const,
      status: "in_progress" as const,
      requesterId: admin._id,
      departmentId: devDept._id,
      assigneeId: dev1._id,
      assignedBy: devManager._id,
    },
  ];

  const tickets = await Promise.all(
    ticketsData.map(data => 
      Ticket.findOneAndUpdate(
        { ticketNumber: data.ticketNumber },
        data,
        { upsert: true, returnDocument: "after" }
      )
    )
  );

  const commentsData = [
    { ticketId: tickets[0]._id, authorId: dev1._id, body: "Investigating the issue. Can reproduce on iOS 17 Safari." },
    { ticketId: tickets[0]._id, authorId: client1._id, body: "Thanks for the quick response! Let me know if you need more details." },
    { ticketId: tickets[1]._id, authorId: dev2._id, body: "Started working on the dark mode toggle. Will use CSS variables for theming." },
    { ticketId: tickets[3]._id, authorId: marketing1._id, body: "Landing page is live at campaign.example.com. All tracking configured." },
    { ticketId: tickets[3]._id, authorId: client2._id, body: "Looks great! The form integration works perfectly." },
    { ticketId: tickets[5]._id, authorId: sales1._id, body: "Investigating Salesforce API logs. Seeing timeout errors on batch updates." },
    { ticketId: tickets[8]._id, authorId: dev1._id, body: "Implemented exponential backoff for API calls. Testing under load now." },
  ];

  await Promise.all(
    commentsData.map(data => 
      Comment.findOneAndUpdate(
        { ticketId: data.ticketId, authorId: data.authorId, body: data.body },
        data,
        { upsert: true, returnDocument: "after" }
      )
    )
  );

  /* --------- Default routing rules & agent availability --------- */
  const teamMembers = users.filter((u) => ["team", "manager"].includes(u.role));

  // Seed default routing rules only when none exist — never wipe rules the
  // operator has configured (the seed must be safe to run against any DB).
  const existingRuleCount = await RoutingRule.countDocuments({});

  if (existingRuleCount === 0) {
    await Promise.all([
    RoutingRule.create({
      name: "Urgent bugs → Dev Manager + Dev team",
      description: "Any bug marked urgent is escalated to the development manager and the Dev team.",
      priority: 10,
      matchType: "all",
      conditions: [
        { field: "category", operator: "equals", value: "development" },
        { field: "priority", operator: "in", value: ["high", "urgent"] },
      ],
      actions: [
        { type: "assign_department", targetId: devDept._id.toString() },
        { type: "set_priority", value: "urgent" },
      ],
      fallbackAssigneeId: devManager._id,
      status: "active",
    }),
    RoutingRule.create({
      name: "Sales & CRM issues → Sales pool",
      description: "Tickets mentioning Salesforce, leads, deals, or invoices route to the Sales team.",
      priority: 30,
      matchType: "any",
      conditions: [
        {
          field: "keyword",
          operator: "contains",
          value: ["salesforce", "crm", "lead", "deal", "invoice", "pipeline"],
        },
      ],
      actions: [{ type: "assign_department", targetId: salesDept._id.toString() }],
      fallbackAssigneeId: salesManager._id,
      status: "active",
    }),
    RoutingRule.create({
      name: "Marketing & campaign requests",
      description: "Feature requests related to landing pages, campaigns, or social media go to Marketing.",
      priority: 40,
      matchType: "any",
      conditions: [
        {
          field: "keyword",
          operator: "contains",
          value: ["campaign", "landing page", "social", "brand", "marketing"],
        },
      ],
      actions: [{ type: "assign_department", targetId: marketingDept._id.toString() }],
      fallbackAssigneeId: marketingManager._id,
      status: "active",
    }),
    RoutingRule.create({
      name: "Mobile / iOS / Android → Dev team",
      description: "Anything that smells like a mobile platform bug goes to development.",
      priority: 50,
      matchType: "any",
      conditions: [
        { field: "keyword", operator: "contains", value: ["ios", "android", "mobile", "safari", "react native"] },
      ],
      actions: [{ type: "assign_department", targetId: devDept._id.toString() }],
      fallbackAssigneeId: devManager._id,
      status: "active",
    }),
    RoutingRule.create({
      name: "Account / login / auth → Dev",
      description: "Authentication, login, or 2FA requests go to development.",
      priority: 60,
      matchType: "any",
      conditions: [
        { field: "keyword", operator: "contains", value: ["login", "auth", "2fa", "password", "session"] },
      ],
      actions: [{ type: "assign_department", targetId: devDept._id.toString() }],
      status: "active",
    }),
    RoutingRule.create({
      name: "General fallback → round-robin",
      description: "If no rule matches, distribute to the lightest available agent.",
      priority: 999,
      matchType: "any",
      // "other" is the surviving successor of the legacy "support" category —
      // a legacy value here would make this rule permanently unmatched.
      conditions: [{ field: "category", operator: "equals", value: "other" }],
      actions: [{ type: "assign_department", targetId: devDept._id.toString() }],
      status: "active",
    }),
    ]);
  } else {
    console.log(`Skipped routing rule seeding — ${existingRuleCount} existing rules found.`);
  }

  // Agent availability with skills so the routing engine has signal
  const skillMap: Record<string, string[]> = {
    "Alex Developer": ["javascript", "typescript", "react", "node", "api", "auth", "ios", "mobile"],
    "Jordan Coder": ["react", "react native", "ios", "android", "ui", "frontend"],
    "Taylor Marketer": ["campaign", "landing page", "hubspot", "copywriting", "seo"],
    "Casey Creative": ["design", "brand", "figma", "social", "content"],
    "Morgan Seller": ["salesforce", "crm", "pipeline", "leads", "deals", "invoice"],
    "Riley Closer": ["sales", "outbound", "closing", "contracts", "onboarding"],
    "Dev Manager": ["javascript", "typescript", "react", "architecture", "review"],
    "Marketing Manager": ["campaign", "leadership", "analytics", "brand"],
    "Sales Manager": ["salesforce", "crm", "sales", "leadership", "forecasting"],
  };

  for (const member of teamMembers) {
    await AgentAvailability.findOneAndUpdate(
      { userId: member._id },
      {
        userId: member._id,
        status: "available",
        capacity: 8,
        currentLoad: Math.floor(Math.random() * 5),
        skills: skillMap[member.name] ?? ["general"],
        lastSeenAt: new Date(),
      },
      { upsert: true, returnDocument: "after" }
    );
  }

  console.log("Seeding complete!");
  console.log(`Created ${departments.length} departments`);
  console.log(`Created ${categoryDocs.length} categories`);
  console.log(`Created ${users.length} users`);
  console.log(`Created ${tickets.length} tickets`);
  console.log(`Created ${commentsData.length} comments`);
  console.log(
    existingRuleCount === 0
      ? "Created 6 default routing rules"
      : "Kept existing routing rules"
  );
  console.log(`Created ${teamMembers.length} agent availability records`);

  await mongoose.disconnect();
  process.exit(0);
}

if (require.main === module) {
  seed().catch(err => {
    console.error("Seeding failed:", err);
    process.exit(1);
  });
}