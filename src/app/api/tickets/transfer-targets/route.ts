import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongo";
import { User, Department } from "@/lib/db/models";
import { requireApiRole } from "@/lib/authz";

// Directory for the inter-department transfer panel: every department except
// the sender's own, plus that department's manager and team members. Used by
// the "Send to team" dialog when an agent/manager dispatches a ticket.
export async function GET() {
  try {
    const authResult = await requireApiRole("team", "manager", "super_admin");
    if (authResult instanceof NextResponse) return authResult;
    const actor = authResult;
    await connectDB();

    const departments = await Department.find({}).select("_id name color").sort({ name: 1 }).lean();

    const ownDeptId = actor.departmentId;
    const visibleDepartments = departments.filter(
      (d) => !ownDeptId || d._id.toString() !== ownDeptId
    );
    const visibleIds = visibleDepartments.map((d) => d._id);

    // Members of the target departments (managers + agents), active only.
    const members = await User.find({
      departmentId: { $in: visibleIds },
      role: { $in: ["manager", "team"] },
      active: true,
    })
      .select("_id name email role departmentId")
      .lean();

    return NextResponse.json({
      departments: visibleDepartments.map((d) => ({
        id: d._id.toString(),
        name: d.name,
        color: d.color,
      })),
      members: members.map((m) => ({
        id: m._id.toString(),
        name: m.name,
        email: m.email,
        role: m.role,
        departmentId: m.departmentId?.toString() ?? null,
      })),
    });
  } catch (error) {
    console.error("GET /api/tickets/transfer-targets error:", error);
    return NextResponse.json({ error: "Failed to load transfer targets" }, { status: 500 });
  }
}
