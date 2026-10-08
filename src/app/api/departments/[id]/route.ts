import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongo";
import { Department, User, Ticket } from "@/lib/db/models";
import { requireApiRole, escapeRegExp } from "@/lib/authz";
import { z } from "zod";
import mongoose from "mongoose";

const departmentUpdateSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  description: z.string().max(500).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiRole("super_admin");
    if (authResult instanceof NextResponse) return authResult;
    await connectDB();
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid department ID" }, { status: 400 });
    }

    const department = await Department.findById(id);
    if (!department) {
      return NextResponse.json({ error: "Department not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = departmentUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { name, color, description } = parsed.data;
    const updateData: Record<string, unknown> = {};

    if (name) {
      const existingDept = await Department.findOne({
        name: { $regex: `^${escapeRegExp(name)}$`, $options: "i" },
        _id: { $ne: id },
      });
      if (existingDept) {
        return NextResponse.json(
          { error: "A department with this name already exists" },
          { status: 409 }
        );
      }
      updateData.name = name;
    }
    if (color) updateData.color = color;
    if (description !== undefined) updateData.description = description;

    const updatedDepartment = await Department.findByIdAndUpdate(id, updateData, { returnDocument: "after" }).lean();

    return NextResponse.json({ department: updatedDepartment });
  } catch (error) {
    console.error("PATCH /api/departments/[id] error:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to update department" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiRole("super_admin");
    if (authResult instanceof NextResponse) return authResult;
    await connectDB();
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid department ID" }, { status: 400 });
    }

    const department = await Department.findById(id);
    if (!department) {
      return NextResponse.json({ error: "Department not found" }, { status: 404 });
    }

    const usersInDept = await User.countDocuments({ departmentId: id });
    if (usersInDept > 0) {
      return NextResponse.json(
        { error: `Cannot delete department with ${usersInDept} assigned users` },
        { status: 400 }
      );
    }
    const ticketsInDept = await Ticket.countDocuments({ departmentId: id });
    if (ticketsInDept > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete department with ${ticketsInDept} associated ticket(s). Reassign or close them first.`,
        },
        { status: 400 }
      );
    }

    await Department.findByIdAndDelete(id);

    return NextResponse.json({ message: "Department deleted successfully" });
  } catch (error) {
    console.error("DELETE /api/departments/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete department" }, { status: 500 });
  }
}