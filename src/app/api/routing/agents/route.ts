import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/mongo";
import { AgentAvailability, User, Department, Ticket } from "@/lib/db/models";
import { requireApiRole } from "@/lib/authz";

export async function GET() {
  try {
    const authResult = await requireApiRole("super_admin", "manager", "team");
    if (authResult instanceof NextResponse) return authResult;
    const actor = authResult;
    await connectDB();

    // Managers and team users only see agents within their own department, so
    // the RuleBuilder / capacity board cannot enumerate the rest of the org
    // (name + email + workload of every member is otherwise an org directory
    // leak to any staff account). Team users without a department see only
    // themselves. super_admin sees everything.
    const scopedDeptId = actor.role === "super_admin" ? null : actor.departmentId ?? "__none__";

    const availability = await AgentAvailability.find({}).lean();

    // Every active team/manager user is a candidate agent, whether or not an
    // availability record exists yet (defaults are materialized below).
    const users = await User.find({
      role: { $in: ["team", "manager"] },
      active: true,
    })
      .select("_id name email role departmentId")
      .populate("departmentId", "name color")
      .lean();

    const departments = await Department.find(
      scopedDeptId ? { _id: scopedDeptId } : {}
    )
      .select("name color")
      .lean();

    // Ensure every active team/manager user has an availability record.
    // This GET is read-only: missing records are materialized as defaults in
    // memory (same shape as AgentAvailability.create used to produce) instead
    // of being written on read. Real records are created lazily by the PATCH
    // endpoint's upsert when an agent first changes their availability.
    const availabilityMap = new Map(availability.map((a) => [a.userId.toString(), a]));
    // Materialize default availability in memory for agents with no record —
    // same shape the old create-on-read path produced.
    const updatedAvailability = users.map((u) => {
      const existing = availabilityMap.get(u._id.toString());
      if (existing) return existing;
      return {
        userId: u._id,
        status: "available" as const,
        capacity: 10,
        skills: [] as string[],
        lastSeenAt: u._id.getTimestamp(),
      };
    });

    const loadAgg = await Ticket.aggregate([
      { $match: { assigneeId: { $in: users.map((u) => u._id) }, status: { $in: ["open", "in_progress", "on_hold"] } } },
      { $group: { _id: "$assigneeId", count: { $sum: 1 } } },
    ]);
    const loadMap = new Map(loadAgg.map((l: { _id: mongoose.Types.ObjectId; count: number }) => [l._id.toString(), l.count]));

    const visibleUsers = users.filter((u: any) => {
      if (scopedDeptId === null) return true; // super_admin
      const uDept = u.departmentId && typeof u.departmentId === "object"
        ? (u.departmentId as any)._id?.toString()
        : u.departmentId?.toString();
      if (scopedDeptId === "__none__") {
        // Dept-less actor: only their own record.
        return u._id.toString() === actor.id;
      }
      return uDept === scopedDeptId;
    });

    const result = visibleUsers.map((u: any) => {
      const av = updatedAvailability.find((a) => a.userId.toString() === u._id.toString());
      return {
        userId: u._id.toString(),
        name: u.name,
        email: u.email,
        role: u.role,
        department: u.departmentId
          ? { id: (u.departmentId as any)._id.toString(), name: (u.departmentId as any).name, color: (u.departmentId as any).color }
          : null,
        status: av?.status ?? "available",
        capacity: av?.capacity ?? 10,
        currentLoad: loadMap.get(u._id.toString()) ?? 0,
        skills: av?.skills ?? [],
        lastSeenAt: av?.lastSeenAt ?? null,
      };
    });

    return NextResponse.json({
      agents: result,
      departments: departments.map((d) => ({
        id: d._id.toString(),
        name: d.name,
        color: d.color,
      })),
    });
  } catch (error) {
    console.error("GET /api/routing/agents error:", error);
    return NextResponse.json({ error: "Failed to fetch agents" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authResult = await requireApiRole("super_admin", "manager", "team");
    if (authResult instanceof NextResponse) return authResult;
    const actor = authResult;
    await connectDB();
    const body = await request.json();
    const { userId, status, capacity, skills } = body;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
    }

    // Authorization: a user may edit only their own availability, unless they are a
    // manager (limited to their department) or a super admin.
    if (actor.role !== "super_admin" && actor.id !== userId) {
      if (actor.role === "manager") {
        const target = await User.findById(userId).select("departmentId").lean();
        if (!target || target.departmentId?.toString() !== actor.departmentId) {
          return NextResponse.json(
            { error: "Managers can only update agents in their department" },
            { status: 403 }
          );
        }
      } else {
        return NextResponse.json(
          { error: "You can only update your own availability" },
          { status: 403 }
        );
      }
    }

    const update: Record<string, unknown> = { lastSeenAt: new Date() };
    if (status && ["available", "busy", "away", "offline"].includes(status)) update.status = status;
    if (typeof capacity === "number" && capacity >= 0 && capacity <= 100) update.capacity = capacity;
    if (Array.isArray(skills)) {
      update.skills = skills
        .slice(0, 20) // bound array size
        .map((s: string) => String(s).toLowerCase().trim().slice(0, 32))
        .filter(Boolean);
    }

    const doc = await AgentAvailability.findOneAndUpdate(
      { userId: new mongoose.Types.ObjectId(userId) },
      { $set: update, $setOnInsert: { userId: new mongoose.Types.ObjectId(userId), capacity: 10 } },
      { upsert: true, returnDocument: "after" }
    ).lean();

    return NextResponse.json({ availability: doc });
  } catch (error) {
    console.error("PATCH /api/routing/agents error:", error);
    return NextResponse.json({ error: "Failed to update agent" }, { status: 500 });
  }
}
