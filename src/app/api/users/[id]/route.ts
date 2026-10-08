import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongo";
import { User, Ticket, Comment } from "@/lib/db/models";
import { requireApiRole } from "@/lib/authz";
import { invalidateSessionCheck, invalidatePermissionsCheck } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { z } from "zod";
import mongoose from "mongoose";

const userUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  role: z.enum(["super_admin", "manager", "team", "client"]).optional(),
  departmentId: z.string().nullable().optional(),
  // Team-role ticket scope — mirrors the create policy (agents only).
  ticketAccess: z.enum(["department", "assigned"]).optional(),
  // Superadmin-only field. null clears the current reporting manager.
  reportingManagerId: z.string().nullable().optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiRole("super_admin", "manager");
    if (authResult instanceof NextResponse) return authResult;
    const currentUser = authResult;
    await connectDB();
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
    }

    const targetUser = await User.findById(id).lean();
    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (currentUser.role === "manager") {
      if (targetUser.role === "super_admin") {
        return NextResponse.json({ error: "Cannot modify super admin" }, { status: 403 });
      }
      if (targetUser.departmentId?.toString() !== currentUser.departmentId) {
        return NextResponse.json({ error: "Cannot modify users outside your department" }, { status: 403 });
      }
    }

    if (id === currentUser.id && currentUser.role !== "super_admin") {
      return NextResponse.json({ error: "Cannot modify your own account" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = userUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { name, email, role, departmentId, active, password, ticketAccess, reportingManagerId } = parsed.data;
    const updateData: Record<string, unknown> = {};

    if (name) updateData.name = name;
    if (email) {
      const existingUser = await User.findOne({ email: email.toLowerCase(), _id: { $ne: id } });
      if (existingUser) {
        return NextResponse.json({ error: "Email already in use" }, { status: 409 });
      }
      updateData.email = email.toLowerCase();
    }
    if (role) {
      if (currentUser.role === "manager" && role === "super_admin") {
        return NextResponse.json({ error: "Managers cannot assign super admin role" }, { status: 403 });
      }
      updateData.role = role;
    }
    if (ticketAccess !== undefined) {
      // Same rule as creation: ticket access applies to agents only (the
      // effective role is the new one when role changes in this request).
      const effectiveRole = role ?? targetUser.role;
      if (effectiveRole !== "team") {
        return NextResponse.json(
          { error: "Ticket access applies only to team members" },
          { status: 400 }
        );
      }
      updateData.ticketAccess = ticketAccess;
    }
    if (departmentId !== undefined) {
      if (currentUser.role === "manager") {
        // Managers must keep users inside their own department; they may not
        // move users to another department or clear the assignment.
        if (!departmentId || departmentId !== currentUser.departmentId) {
          return NextResponse.json(
            { error: "Managers can only keep users within their own department" },
            { status: 403 }
          );
        }
      }
      if (departmentId) {
        if (!mongoose.Types.ObjectId.isValid(departmentId)) {
          return NextResponse.json({ error: "Invalid department ID" }, { status: 400 });
        }
        updateData.departmentId = new mongoose.Types.ObjectId(departmentId);
      } else {
        updateData.departmentId = null;
      }
    }
    if (reportingManagerId !== undefined) {
      // Superadmin-only field, mirrors creation. null = clear the field.
      if (currentUser.role !== "super_admin") {
        return NextResponse.json(
          { error: "Only a super admin can set a reporting manager" },
          { status: 403 }
        );
      }
      if (!reportingManagerId) {
        updateData.reportingManagerId = null;
      } else {
        const reportingManager = await User.findOne({
          _id: reportingManagerId,
          role: "manager",
          active: true,
        })
          .select("_id")
          .lean();
        if (!reportingManager) {
          return NextResponse.json({ error: "Reporting manager not found" }, { status: 400 });
        }
        updateData.reportingManagerId = reportingManager._id;
      }
    }
    if (active !== undefined) {
      if (id === currentUser.id && !active) {
        return NextResponse.json({ error: "Cannot deactivate yourself" }, { status: 400 });
      }
      updateData.active = active;
    }
    if (password) {
      updateData.passwordHash = await hashPassword(password);
      // Kick all pre-change sessions for the target user (incl. stolen ones).
      updateData.sessionVersion = (targetUser.sessionVersion ?? 0) + 1;
    }

    const updatedUser = await User.findByIdAndUpdate(id, updateData, { returnDocument: "after" })
      .select("-passwordHash")
      .populate("departmentId", "name color")
      .lean();

    if (password) {
      invalidateSessionCheck(id);
    }
    // Permission changes land on the target user's very next request instead
    // of up to 60s later (session revalidation TTL).
    if (
      updateData.role !== undefined ||
      updateData.departmentId !== undefined ||
      updateData.active !== undefined ||
      updateData.ticketAccess !== undefined ||
      updateData.reportingManagerId !== undefined
    ) {
      invalidatePermissionsCheck(id);
    }

    return NextResponse.json({ user: updatedUser });
  } catch (error) {
    console.error("PATCH /api/users/[id] error:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiRole("super_admin");
    if (authResult instanceof NextResponse) return authResult;
    const currentUser = authResult;
    await connectDB();
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
    }

    if (id === currentUser.id) {
      return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });
    }

    const targetUser = await User.findById(id);
    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (targetUser.role === "super_admin") {
      return NextResponse.json({ error: "Cannot delete super admin" }, { status: 403 });
    }

    const [owned, assigned, commented] = await Promise.all([
      Ticket.countDocuments({ requesterId: id }),
      Ticket.countDocuments({ assigneeId: id }),
      Comment.countDocuments({ authorId: id }),
    ]);
    if (owned + assigned + commented > 0) {
      return NextResponse.json(
        {
          error:
            "Cannot delete a user with associated tickets or comments. Deactivate the account instead.",
        },
        { status: 409 }
      );
    }

    await User.findByIdAndDelete(id);

    return NextResponse.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("DELETE /api/users/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}