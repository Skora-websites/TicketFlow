import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongo";
import { Department } from "@/lib/db/models";
import { requireApiRole, sanitizeSearch, escapeRegExp } from "@/lib/authz";
import { z } from "zod";

const departmentQuerySchema = z.object({
  page: z.coerce.number().positive().default(1),
  limit: z.coerce.number().positive().max(100).default(20),
  search: z.string().optional(),
});

const departmentCreateSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(50),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Invalid color format (use #RRGGBB)"),
  description: z.string().max(500).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiRole("super_admin", "manager");
    if (authResult instanceof NextResponse) return authResult;
    const user = authResult;
    await connectDB();

    const { searchParams } = new URL(request.url);
    const query = departmentQuerySchema.parse(Object.fromEntries(searchParams));

    const { page, limit, search } = query;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};

    if (user.role === "manager") {
      if (!user.departmentId) {
        return NextResponse.json({ departments: [], pagination: { page: 1, limit, total: 0, totalPages: 0 } });
      }
      filter._id = user.departmentId;
    }

    const safeSearch = sanitizeSearch(search);
    if (safeSearch) {
      filter.$or = [
        { name: { $regex: safeSearch, $options: "i" } },
        { description: { $regex: safeSearch, $options: "i" } },
      ];
    }

    const [departments, total] = await Promise.all([
      Department.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(),
      Department.countDocuments(filter),
    ]);

    return NextResponse.json({
      departments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("GET /api/departments error:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to fetch departments" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireApiRole("super_admin");
    if (authResult instanceof NextResponse) return authResult;
    await connectDB();

    const body = await request.json();
    const parsed = departmentCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { name, color, description } = parsed.data;

    const existingDept = await Department.findOne({ name: { $regex: `^${escapeRegExp(name)}$`, $options: "i" } });
    if (existingDept) {
      return NextResponse.json(
        { error: "A department with this name already exists" },
        { status: 409 }
      );
    }

    const department = await Department.create({ name, color, description });

    return NextResponse.json({ department }, { status: 201 });
  } catch (error) {
    console.error("POST /api/departments error:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create department" }, { status: 500 });
  }
}