import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongo";
import { User } from "@/lib/db/models";
import { requireApiRole, sanitizeSearch } from "@/lib/authz";
import { hashPassword } from "@/lib/password";
import { sendCredentialEmail, isSmtpConfigured } from "@/lib/mailer";
import { z } from "zod";
import mongoose from "mongoose";
import { randomBytes } from "node:crypto";

const userQuerySchema = z.object({
  page: z.coerce.number().positive().default(1),
  limit: z.coerce.number().positive().max(100).default(20),
  role: z.enum(["super_admin", "manager", "team", "client"]).or(z.literal("")).optional(),
  departmentId: z.string().optional(),
  // z.coerce.boolean() turns ?active=false into true (Boolean("false") is
  // true), so parse the literal query strings instead.
  active: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  search: z.string().optional(),
});

const userCreateSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  role: z.enum(["super_admin", "manager", "team", "client"]),
  departmentId: z.string().optional(),
  // Team-role ticket scope, chosen by the creating manager/superadmin.
  ticketAccess: z.enum(["department", "assigned"]).optional(),
  // Superadmin-only: which manager this user reports to.
  reportingManagerId: z.string().optional(),
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
});

/** Cryptographer-random password: 3 friendly words + 3 digits, ~55 bits. */
function generatePassword(): string {
  const words = ["atlas", "bravo", "cedar", "delta", "ember", "fjord", "grove", "harbor", "ivory", "jasper", "kiln", "lumen", "maple", "nova", "onyx", "pixel", "quartz", "raven", "slate", "tundra"];
  const pick = () => words[randomBytes(1)[0] % words.length];
  const digits = (randomBytes(2).readUInt16BE(0) % 1000).toString().padStart(3, "0");
  return `${pick()}-${pick()}-${digits}`;
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiRole("super_admin", "manager");
    if (authResult instanceof NextResponse) return authResult;
    const user = authResult;
    await connectDB();

    const { searchParams } = new URL(request.url);
    const query = userQuerySchema.parse(Object.fromEntries(searchParams));

    const { page, limit, role, departmentId, active, search } = query;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};

    if (user.role === "manager") {
      if (!user.departmentId) {
        // Dept-less managers may not browse the user directory at all.
        return NextResponse.json({ users: [], pagination: { page: 1, limit, total: 0, totalPages: 0 } });
      }
      filter.departmentId = user.departmentId;
    }

    if (role) filter.role = role;
    // Department scoping: managers are always locked to their own department
    // AFTER user-supplied filters, so ?departmentId=<other> cannot override it.
    if (user.role === "manager") filter.departmentId = user.departmentId;
    else if (departmentId) filter.departmentId = departmentId;
    if (active !== undefined) filter.active = active;

    const safeSearch = sanitizeSearch(search);
    if (safeSearch) {
      filter.$or = [
        { name: { $regex: safeSearch, $options: "i" } },
        { email: { $regex: safeSearch, $options: "i" } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select("-passwordHash")
        .populate("departmentId", "name color")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    return NextResponse.json({
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("GET /api/users error:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireApiRole("super_admin", "manager");
    if (authResult instanceof NextResponse) return authResult;
    const user = authResult;
    await connectDB();

    const body = await request.json();
    const parsed = userCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { name, email, role, departmentId, ticketAccess, reportingManagerId, password } = parsed.data;

    // ── Who may create whom ─────────────────────────────────────────
    //  - Manager → agents ("team") in THEIR OWN department only, choosing
    //    whether the agent sees all dept tickets or just assigned ones.
    //  - Super admin → managers (own department required) and agents (any
    //    department, plus department + reporting-manager fields).
    if (user.role === "manager") {
      if (role !== "team") {
        return NextResponse.json(
          { error: "Managers can only add agents to their department" },
          { status: 403 }
        );
      }
      if (!departmentId || departmentId !== user.departmentId) {
        return NextResponse.json(
          { error: "Managers can only add agents to their own department" },
          { status: 403 }
        );
      }
    } else if (user.role === "super_admin") {
      if (role === "super_admin") {
        return NextResponse.json({ error: "Cannot create another super admin" }, { status: 403 });
      }
      if (role === "manager" && !departmentId) {
        return NextResponse.json(
          { error: "A manager must be assigned to a department" },
          { status: 400 }
        );
      }
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    // Reporting manager (superadmin-only field): must exist, be an active
    // manager — normally of the new user's department.
    let reportingManager: { _id: mongoose.Types.ObjectId } | null = null;
    if (reportingManagerId) {
      if (user.role !== "super_admin") {
        return NextResponse.json(
          { error: "Only a super admin can set a reporting manager" },
          { status: 403 }
        );
      }
      reportingManager = await User.findOne({
        _id: reportingManagerId,
        role: "manager",
        active: true,
      })
        .select("_id")
        .lean();
      if (!reportingManager) {
        return NextResponse.json({ error: "Reporting manager not found" }, { status: 400 });
      }
    }

    // ── Credentials: username + password are EMAILED to the new user ──
    // The admin may type a password; otherwise a strong random one is
    // generated. The plaintext is never stored and never returned in a
    // response body (only the dev-only fallback below, and never in prod).
    const devFallback = !isSmtpConfigured() && process.env.NODE_ENV !== "production";
    const plaintextPassword = password ?? generatePassword();
    const passwordHash = await hashPassword(plaintextPassword);

    const newUser = await User.create({
      name,
      email: email.toLowerCase(),
      passwordHash,
      role,
      departmentId: departmentId ? new mongoose.Types.ObjectId(departmentId) : undefined,
      ticketAccess: role === "team" ? (ticketAccess ?? "department") : undefined,
      reportingManagerId: reportingManager ? reportingManager._id : undefined,
      active: true,
    });

    await sendCredentialEmail(email.toLowerCase(), plaintextPassword, name, role);

    const populatedUser = await User.findById(newUser._id)
      .select("-passwordHash -inviteToken")
      .populate("departmentId", "name color")
      .lean();

    const payload: Record<string, unknown> = { user: populatedUser };
    if (devFallback) {
      // Without SMTP the email could never be delivered, so surface the
      // credentials in non-production only (mirrors register/reset dev
      // fallbacks; never active in production).
      payload.devCredentials = { email: email.toLowerCase(), password: plaintextPassword };
    }

    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    console.error("POST /api/users error:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}