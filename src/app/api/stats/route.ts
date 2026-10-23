import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongo";
import { Ticket, User, Comment } from "@/lib/db/models";
import { getUser } from "@/lib/authz";
import {
  enforceRateLimit,
  acquireHeavyActionSlot,
  getSecurityAndCostStatus,
  DB_QUERY_MAX_TIME_MS,
} from "@/lib/security";
import mongoose from "mongoose";

export async function GET() {
  let heavySlot: { allowed: boolean; release: () => void } | null = null;
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Rate Limit: 15 stats queries / min per user
    const rateCheck = await enforceRateLimit(`stats:${user.id}`, 15, 60_000, "Too many analytics requests. Please wait a minute.");
    if (rateCheck) return rateCheck;

    // Concurrency Throttle: max 2 heavy action runs simultaneously per user
    heavySlot = acquireHeavyActionSlot(user.id, 2);
    if (!heavySlot.allowed) {
      return NextResponse.json(
        { error: "Too many concurrent analytics operations running. Please wait for current requests to finish." },
        { status: 429, headers: { "Retry-After": "5" } }
      );
    }

    await connectDB();

    const baseFilter: Record<string, unknown> = {};

    if (user.role === "client") {
      baseFilter.requesterId = new mongoose.Types.ObjectId(user.id);
    } else if (user.role === "team") {
      // Assigned to me OR filed by me (mirrors canAccessTicket + GET /api/tickets).
      const uid = new mongoose.Types.ObjectId(user.id);
      baseFilter.$or = [{ assigneeId: uid }, { requesterId: uid }];
    } else if (user.role === "manager") {
      // Mirrors GET /api/tickets: department tickets plus pending incoming
      // transfers; orphaned (department-less) unassigned tickets count for
      // triage. Dept-less managers see only their own assigned tickets plus
      // orphaned unassigned ones — never org-wide stats.
      if (user.departmentId) {
        baseFilter.$or = [
          { departmentId: new mongoose.Types.ObjectId(user.departmentId) },
          { assigneeId: null, departmentId: null },
          {
            "transfer.status": "pending",
            "transfer.toDepartmentId": new mongoose.Types.ObjectId(user.departmentId),
          },
        ];
      } else {
        baseFilter.$or = [
          { assigneeId: new mongoose.Types.ObjectId(user.id) },
          { assigneeId: null, departmentId: null },
        ];
      }
    }

    const [
      totalTickets,
      openTickets,
      inProgressTickets,
      onHoldTickets,
      resolvedTickets,
      closedTickets,
      unassignedTickets,
      avgResolution,
      ticketsByStatus,
      ticketsByPriority,
      ticketsByDepartment,
      weeklyTrend,
      weeklyResolved,
      teamWorkload,
      contributions,
    ] = await Promise.all([
      Ticket.countDocuments(baseFilter).maxTimeMS(DB_QUERY_MAX_TIME_MS),
      Ticket.countDocuments({ ...baseFilter, status: "open" }).maxTimeMS(DB_QUERY_MAX_TIME_MS),
      Ticket.countDocuments({ ...baseFilter, status: "in_progress" }).maxTimeMS(DB_QUERY_MAX_TIME_MS),
      Ticket.countDocuments({ ...baseFilter, status: "on_hold" }).maxTimeMS(DB_QUERY_MAX_TIME_MS),
      Ticket.countDocuments({ ...baseFilter, status: "resolved" }).maxTimeMS(DB_QUERY_MAX_TIME_MS),
      Ticket.countDocuments({ ...baseFilter, status: "closed" }).maxTimeMS(DB_QUERY_MAX_TIME_MS),
      Ticket.countDocuments({ ...baseFilter, assigneeId: null }).maxTimeMS(DB_QUERY_MAX_TIME_MS),
      (async () => {
        const result = await Ticket.aggregate(
          [
            {
              $match: {
                ...baseFilter,
                status: { $in: ["resolved", "closed"] },
                closedAt: { $exists: true, $ne: null },
              },
            },
            {
              $project: {
                durationHours: {
                  $divide: [{ $subtract: ["$closedAt", "$createdAt"] }, 1000 * 60 * 60],
                },
              },
            },
            {
              $group: {
                _id: null,
                avgHours: { $avg: "$durationHours" },
              },
            },
          ],
          { maxTimeMS: DB_QUERY_MAX_TIME_MS }
        );

        if (!result.length || result[0].avgHours == null) {
          return { days: 0, hours: 0 };
        }

        const hours = result[0].avgHours;
        return {
          days: Math.round((hours / 24) * 10) / 10,
          hours: Math.round(hours * 10) / 10,
        };
      })(),
      Ticket.aggregate(
        [
          { $match: baseFilter },
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ],
        { maxTimeMS: DB_QUERY_MAX_TIME_MS }
      ),
      Ticket.aggregate(
        [
          { $match: baseFilter },
          { $group: { _id: "$priority", count: { $sum: 1 } } },
        ],
        { maxTimeMS: DB_QUERY_MAX_TIME_MS }
      ),
      Ticket.aggregate(
        [
          { $match: baseFilter },
          {
            $lookup: {
              from: "departments",
              localField: "departmentId",
              foreignField: "_id",
              as: "department",
            },
          },
          { $unwind: { path: "$department", preserveNullAndEmptyArrays: true } },
          { $group: { _id: "$department.name", count: { $sum: 1 } } },
        ],
        { maxTimeMS: DB_QUERY_MAX_TIME_MS }
      ),
      (async () => {
        // One grouped aggregation per series instead of 24 sequential
        // countDocuments round-trips. Week windows are computed locally, then
        // matched with $switch over the createdAt/closedAt range branches.
        const weeks = 12;
        const now = new Date();
        const startOfThisWeek = new Date(now);
        startOfThisWeek.setDate(now.getDate() - now.getDay());
        startOfThisWeek.setHours(0, 0, 0, 0);

        const windows: { week: string; start: Date; end: Date }[] = [];
        for (let i = weeks - 1; i >= 0; i--) {
          const start = new Date(startOfThisWeek);
          start.setDate(start.getDate() - 7 * i);
          const end = new Date(start);
          end.setDate(end.getDate() + 7);
          windows.push({ week: start.toISOString().split("T")[0], start, end });
        }

        const rangeBranches = windows.map((w, i) => ({
          case: {
            $and: [{ $gte: ["$createdAt", w.start] }, { $lt: ["$createdAt", w.end] }],
          },
          then: i,
        }));
        const rangeSwitch = { $switch: { branches: rangeBranches, default: -1 } };

        const trendAgg = (await Ticket.aggregate([
          {
            $match: {
              ...baseFilter,
              createdAt: { $gte: windows[0].start, $lt: windows[windows.length - 1].end },
            },
          },
          { $group: { _id: rangeSwitch, count: { $sum: 1 } } },
        ])) as { _id: number; count: number }[];
        const counts = new Map(trendAgg.map((r) => [r._id, r.count]));
        return windows.map((_, i) => ({ week: windows[i].week, count: counts.get(i) ?? 0 }));
      })(),
      (async () => {
        // Weekly resolved counts via a single grouped aggregation (was 12
        // sequential countDocuments calls).
        const weeks = 12;
        const now = new Date();
        const startOfThisWeek = new Date(now);
        startOfThisWeek.setDate(now.getDate() - now.getDay());
        startOfThisWeek.setHours(0, 0, 0, 0);

        const windows: { week: string; start: Date; end: Date }[] = [];
        for (let i = weeks - 1; i >= 0; i--) {
          const start = new Date(startOfThisWeek);
          start.setDate(start.getDate() - 7 * i);
          const end = new Date(start);
          end.setDate(end.getDate() + 7);
          windows.push({ week: start.toISOString().split("T")[0], start, end });
        }

        const rangeBranches = windows.map((w, i) => ({
          case: {
            $and: [{ $gte: ["$closedAt", w.start] }, { $lt: ["$closedAt", w.end] }],
          },
          then: i,
        }));
        const rangeSwitch = { $switch: { branches: rangeBranches, default: -1 } };

        const resolvedAgg = (await Ticket.aggregate([
          {
            $match: {
              ...baseFilter,
              status: { $in: ["resolved", "closed"] },
              closedAt: { $gte: windows[0].start, $lt: windows[windows.length - 1].end },
            },
          },
          { $group: { _id: rangeSwitch, count: { $sum: 1 } } },
        ])) as { _id: number; count: number }[];
        const counts = new Map(resolvedAgg.map((r) => [r._id, r.count]));
        return windows.map((_, i) => ({ week: windows[i].week, count: counts.get(i) ?? 0 }));
      })(),
      user.role === "super_admin" || (user.role === "manager" && user.departmentId)
        ? (async () => {
            const members = await User.find({
              departmentId: user.departmentId ? new mongoose.Types.ObjectId(user.departmentId) : { $exists: true },
              role: { $in: ["team", "manager"] },
              active: true,
            })
              .select("_id name email")
              .lean();

            if (members.length === 0) return [];

            // Single grouped aggregation for the whole team (was one Ticket.find
            // per member — N+1 that grows with headcount).
            const loadAgg = (await Ticket.aggregate([
              {
                $match: {
                  assigneeId: { $in: members.map((m) => m._id) },
                  status: { $in: ["open", "in_progress", "on_hold"] },
                },
              },
              { $group: { _id: { assignee: "$assigneeId", status: "$status" }, count: { $sum: 1 } } },
            ])) as { _id: { assignee: mongoose.Types.ObjectId; status: string }; count: number }[];

            const workload = members.map((member) => {
              const mine = loadAgg.filter(
                (r) => r._id.assignee.toString() === member._id.toString()
              );
              const byStatus = (s: string) => mine.find((r) => r._id.status === s)?.count ?? 0;
              const open = byStatus("open");
              const in_progress = byStatus("in_progress");
              const on_hold = byStatus("on_hold");
              return {
                user: member,
                open,
                in_progress,
                on_hold,
                total: open + in_progress + on_hold,
              };
            });

            return workload.sort((a, b) => b.total - a.total);
          })()
        : [],
      (async () => {
        const oneYearAgo = new Date();
        oneYearAgo.setUTCDate(oneYearAgo.getUTCDate() - 365);
        oneYearAgo.setUTCHours(0, 0, 0, 0);

        const uid = new mongoose.Types.ObjectId(user.id);

        const [ticketsCreatedAgg, ticketsResolvedAgg, commentsAgg] = await Promise.all([
          Ticket.aggregate(
            [
              {
                $match: {
                  requesterId: uid,
                  createdAt: { $gte: oneYearAgo },
                },
              },
              {
                $group: {
                  _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                  count: { $sum: 1 },
                },
              },
            ],
            { maxTimeMS: DB_QUERY_MAX_TIME_MS }
          ),
          Ticket.aggregate(
            [
              {
                $match: {
                  assigneeId: uid,
                  closedAt: { $exists: true, $ne: null, $gte: oneYearAgo },
                },
              },
              {
                $group: {
                  _id: { $dateToString: { format: "%Y-%m-%d", date: "$closedAt" } },
                  count: { $sum: 1 },
                },
              },
            ],
            { maxTimeMS: DB_QUERY_MAX_TIME_MS }
          ),
          Comment.aggregate(
            [
              {
                $match: {
                  authorId: uid,
                  createdAt: { $gte: oneYearAgo },
                },
              },
              {
                $group: {
                  _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                  count: { $sum: 1 },
                },
              },
            ],
            { maxTimeMS: DB_QUERY_MAX_TIME_MS }
          ),
        ]);

        const countsMap = new Map<string, number>();
        const merge = (list: { _id: string; count: number }[]) => {
          for (const item of list) {
            if (item && item._id) {
              countsMap.set(item._id, (countsMap.get(item._id) || 0) + item.count);
            }
          }
        };
        merge(ticketsCreatedAgg as { _id: string; count: number }[]);
        merge(ticketsResolvedAgg as { _id: string; count: number }[]);
        merge(commentsAgg as { _id: string; count: number }[]);

        const days: { date: string; count: number }[] = [];
        const today = new Date();
        const startDay = new Date(today);
        startDay.setUTCDate(startDay.getUTCDate() - 364);

        for (let d = new Date(startDay); d <= today; d.setUTCDate(d.getUTCDate() + 1)) {
          const dateStr = d.toISOString().slice(0, 10);
          days.push({
            date: dateStr,
            count: countsMap.get(dateStr) ?? 0,
          });
        }
        return days;
      })(),
    ]);

    return NextResponse.json({
      overview: {
        total: totalTickets,
        open: openTickets,
        in_progress: inProgressTickets,
        on_hold: onHoldTickets,
        resolved: resolvedTickets,
        closed: closedTickets,
        unassigned: unassignedTickets,
        avgResolutionDays: avgResolution.days,
        // Sub-day resolutions display as hours instead of a misleading "0d".
        avgResolutionHours: avgResolution.hours,
      },
      charts: {
        byStatus: ticketsByStatus.map((s) => ({ status: s._id, count: s.count })),
        byPriority: ticketsByPriority.map((p) => ({ priority: p._id, count: p.count })),
        byDepartment: ticketsByDepartment.map((d) => ({ department: d._id || "Unassigned", count: d.count })),
        weeklyTrend,
        weeklyResolved,
      },
      workload: teamWorkload,
      contributions,
      quotas: user.role === "super_admin" ? await getSecurityAndCostStatus() : undefined,
    });
  } catch (error) {
    console.error("GET /api/stats error:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  } finally {
    heavySlot?.release();
  }
}