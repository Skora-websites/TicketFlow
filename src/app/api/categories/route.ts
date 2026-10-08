import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/mongo";
import { Category, Ticket } from "@/lib/db/models";
import { requireApiRole, getUser, sanitizeSearch } from "@/lib/authz";
import { slugifyCategory } from "@/lib/categories";
import { z } from "zod";

// Ticket categories power both client tickets and agent tickets. Reading is
// open to every signed-in user (forms need the list); writes are super_admin
// only, per the feature spec. Each category can be linked to the department
// that owns it — transfers of a ticket in that category may only go there.

const categoryCreateSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(40),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Invalid color format (use #RRGGBB)").optional(),
  description: z.string().max(300).optional(),
  departmentId: z.string().nullable().optional(),
});

const categoryUpdateSchema = z.object({
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Invalid color format (use #RRGGBB)").optional(),
  description: z.string().max(300).optional(),
  departmentId: z.string().nullable().optional(),
});

export async function GET() {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await connectDB();

    const categories = await Category.find({})
      .populate("departmentId", "name color")
      .sort({ name: 1 })
      .lean();
    return NextResponse.json({ categories });
  } catch (error) {
    console.error("GET /api/categories error:", error);
    return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireApiRole("super_admin");
    if (authResult instanceof NextResponse) return authResult;
    const user = authResult;
    await connectDB();

    const body = await request.json();
    const parsed = categoryCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const name = parsed.data.name.trim();
    const slug = slugifyCategory(name);
    if (!slug) {
      return NextResponse.json({ error: "Name must contain letters or numbers" }, { status: 400 });
    }

    const existing = await Category.findOne({ slug }).lean();
    if (existing) {
      return NextResponse.json({ error: "A category with this name already exists" }, { status: 409 });
    }

    // Optional owning-department link.
    let departmentId: mongoose.Types.ObjectId | null = null;
    if (parsed.data.departmentId) {
      if (!mongoose.Types.ObjectId.isValid(parsed.data.departmentId)) {
        return NextResponse.json({ error: "Invalid department ID" }, { status: 400 });
      }
      departmentId = new mongoose.Types.ObjectId(parsed.data.departmentId);
    }

    const category = await Category.create({
      name,
      slug,
      color: parsed.data.color,
      description: parsed.data.description,
      departmentId,
      createdBy: new mongoose.Types.ObjectId(user.id),
    });

    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    console.error("POST /api/categories error:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
  }
}

// Update a category's owning department (and color/description). Super_admin
// only — this is the "who receives these tickets" control surface.
export async function PATCH(request: NextRequest) {
  try {
    const authResult = await requireApiRole("super_admin");
    if (authResult instanceof NextResponse) return authResult;
    await connectDB();

    const { searchParams } = new URL(request.url);
    const slug = sanitizeSearch(searchParams.get("slug"), 40);
    if (!slug) {
      return NextResponse.json({ error: "slug query parameter is required" }, { status: 400 });
    }

    const body = await request.json();
    const parsed = categoryUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const category = await Category.findOne({ slug });
    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    if (parsed.data.departmentId !== undefined) {
      if (parsed.data.departmentId === null || parsed.data.departmentId === "") {
        category.departmentId = null;
      } else {
        if (!mongoose.Types.ObjectId.isValid(parsed.data.departmentId)) {
          return NextResponse.json({ error: "Invalid department ID" }, { status: 400 });
        }
        const dept = await mongoose
          .model("Department")
          .findById(parsed.data.departmentId)
          .select("_id")
          .lean();
        if (!dept) {
          return NextResponse.json({ error: "Department not found" }, { status: 404 });
        }
        category.departmentId = new mongoose.Types.ObjectId(parsed.data.departmentId);
      }
    }
    if (parsed.data.color !== undefined) category.color = parsed.data.color;
    if (parsed.data.description !== undefined) category.description = parsed.data.description;

    await category.save();
    return NextResponse.json({ category: category.toObject() });
  } catch (error) {
    console.error("PATCH /api/categories error:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to update category" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireApiRole("super_admin");
    if (authResult instanceof NextResponse) return authResult;
    await connectDB();

    const { searchParams } = new URL(request.url);
    const slug = sanitizeSearch(searchParams.get("slug"), 40);
    if (!slug) {
      return NextResponse.json({ error: "slug query parameter is required" }, { status: 400 });
    }

    const inUse = await Ticket.countDocuments({ category: slug });
    if (inUse > 0) {
      return NextResponse.json(
        { error: `Cannot delete: ${inUse} ticket(s) still use this category` },
        { status: 409 }
      );
    }

    const deleted = await Category.findOneAndDelete({ slug }).lean();
    if (!deleted) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/categories error:", error);
    return NextResponse.json({ error: "Failed to delete category" }, { status: 500 });
  }
}
