import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongo";
import { User } from "@/lib/db/models";
import { getUser } from "@/lib/authz";
import { invalidateSessionCheck } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { z } from "zod";

const meUpdateSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters").optional(),
    email: z.string().email("Invalid email").optional(),
    currentPassword: z.string().min(1).optional(),
    newPassword: z.string().min(8, "Password must be at least 8 characters").optional(),
  })
  .refine((d) => !d.newPassword || !!d.currentPassword, {
    message: "Current password is required to set a new password",
    path: ["currentPassword"],
  });

export async function PATCH(request: NextRequest) {
  try {
    const authUser = await getUser();
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const body = await request.json();
    const parsed = meUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { name, email, currentPassword, newPassword } = parsed.data;

    const user = await User.findById(authUser.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};

    if (name) updateData.name = name;
    if (email && email.toLowerCase() !== user.email) {
      const existing = await User.findOne({ email: email.toLowerCase(), _id: { $ne: user._id } });
      if (existing) {
        return NextResponse.json({ error: "Email already in use" }, { status: 409 });
      }
      updateData.email = email.toLowerCase();
    }

    if (newPassword) {
      const ok = await verifyPassword(currentPassword!, user.passwordHash);
      if (!ok) {
        return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
      }
      updateData.passwordHash = await hashPassword(newPassword);
      // Invalidate every JWT minted before this change (including this one).
      updateData.sessionVersion = (user.sessionVersion ?? 0) + 1;
    }

    if (Object.keys(updateData).length === 0) {
      const current = await User.findById(user._id).select("-passwordHash").lean();
      return NextResponse.json({ user: current });
    }

    const updated = await User.findByIdAndUpdate(user._id, updateData, { returnDocument: "after" })
      .select("-passwordHash")
      .lean();

    if (newPassword) {
      invalidateSessionCheck(user._id.toString());
    }

    return NextResponse.json({ user: updated });
  } catch (error) {
    console.error("PATCH /api/users/me error:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
