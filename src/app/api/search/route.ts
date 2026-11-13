import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongo";
import { Ticket, Comment, User } from "@/lib/db/models";
import { requireApiRole, canAccessTicket, sanitizeSearch, type SessionUser } from "@/lib/authz";
import { DB_QUERY_MAX_TIME_MS } from "@/lib/security";

/**
 * GET /api/search?q=...
 *
 * Staff-only companion to the ticket search. Finds matches that live outside
 * ticket titles/descriptions: conversation messages, attachment filenames and
 * people. Every hit is filtered through `canAccessTicket`, so this endpoint can
 * never reveal a ticket the caller cannot open (it does NOT trust a list query
 * alone — the same predicate the detail route uses decides).
 *
 * Deliberately bounded: at most 40 comments and 40 attachment-bearing tickets
 * are scanned per request, and at most 5 of each are returned.
 */

const MAX_SCAN = 40;
const MAX_RESULTS = 5;
const SNIPPET_RADIUS = 60;

interface SearchTicketFields {
  _id: unknown;
  ticketNumber?: string;
  title?: string;
  requesterId?: unknown;
  assigneeId?: unknown;
  departmentId?: unknown;
  transfer?: unknown;
}

function canSeeTicket(user: SessionUser, ticket: SearchTicketFields | null | undefined): boolean {
  if (!ticket) return false;
  const asId = (value: unknown): string | undefined => {
    if (value === null || value === undefined) return undefined;
    if (typeof value === "object" && "_id" in (value as object)) {
      return String((value as { _id: unknown })._id);
    }
    return String(value);
  };
  return canAccessTicket(
    user.role,
    user.id,
    asId(ticket.requesterId) ?? "",
    asId(ticket.assigneeId),
    asId(ticket.departmentId),
    user.departmentId,
    ticket.transfer as never,
    user.ticketAccess
  );
}

/** Short excerpt around the first match, collapsed to one line. */
function snippet(body: string, needle: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  const at = flat.toLowerCase().indexOf(needle.toLowerCase());
  if (at < 0) return flat.slice(0, SNIPPET_RADIUS * 2);
  const start = Math.max(0, at - SNIPPET_RADIUS);
  const end = Math.min(flat.length, at + needle.length + SNIPPET_RADIUS);
  return `${start > 0 ? "…" : ""}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`;
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiRole("team", "manager", "super_admin");
    if (authResult instanceof NextResponse) return authResult;
    const user = authResult;

    const raw = new URL(request.url).searchParams.get("q");
    const needle = sanitizeSearch(raw, 100);
    if (!needle || needle.replace(/\\./g, "").length < 2) {
      return NextResponse.json({ comments: [], attachments: [], people: [] });
    }

    await connectDB();
    const regex = { $regex: needle, $options: "i" };

    const commentRows = await Comment.find({ body: regex, kind: "message" })
      .sort({ createdAt: -1 })
      .limit(MAX_SCAN)
      .populate("authorId", "name role")
      .populate(
        "ticketId",
        "ticketNumber title requesterId assigneeId departmentId transfer"
      )
      .maxTimeMS(DB_QUERY_MAX_TIME_MS)
      .lean();

    const comments: {
      id: string;
      ticketId: string;
      ticketNumber: string;
      ticketTitle: string;
      snippet: string;
      authorName: string;
      internal: boolean;
    }[] = [];
    for (const row of commentRows) {
      const ticket = row.ticketId as unknown as SearchTicketFields | null;
      if (!canSeeTicket(user, ticket)) continue;
      comments.push({
        id: String(row._id),
        ticketId: String(ticket!._id),
        ticketNumber: ticket!.ticketNumber ?? "",
        ticketTitle: ticket!.title ?? "",
        snippet: snippet(row.body, (raw ?? "").trim()),
        authorName: (row.authorId as unknown as { name?: string } | null)?.name ?? "Unknown",
        internal: row.visibility === "internal",
      });
      if (comments.length >= MAX_RESULTS) break;
    }

    const attachmentTickets = await Ticket.find({ "attachments.name": regex })
      .select("ticketNumber title requesterId assigneeId departmentId transfer attachments.name attachments.mime")
      .limit(MAX_SCAN)
      .maxTimeMS(DB_QUERY_MAX_TIME_MS)
      .lean();

    const attachments: {
      ticketId: string;
      ticketNumber: string;
      ticketTitle: string;
      name: string;
      mime: string;
    }[] = [];
    for (const ticket of attachmentTickets) {
      if (!canSeeTicket(user, ticket as unknown as SearchTicketFields)) continue;
      for (const file of ticket.attachments ?? []) {
        if (!new RegExp(needle, "i").test(file.name)) continue;
        attachments.push({
          ticketId: String(ticket._id),
          ticketNumber: ticket.ticketNumber,
          ticketTitle: ticket.title,
          name: file.name,
          mime: file.mime ?? "",
        });
        if (attachments.length >= MAX_RESULTS) break;
      }
      if (attachments.length >= MAX_RESULTS) break;
    }

    // People: only users the caller may already browse. Super admins see every
    // account; managers see their own department (the /api/users rule).
    // Agents have no directory, so they get no people group rather than a
    // weaker privacy boundary that pretends to be the directory.
    const people: { id: string; name: string; email: string; role: string; department: string }[] = [];
    if (user.role === "super_admin" || (user.role === "manager" && user.departmentId)) {
      const peopleFilter: Record<string, unknown> = {
        active: true,
        $or: [{ name: regex }, { email: regex }],
      };
      if (user.role === "manager") peopleFilter.departmentId = user.departmentId;

      const userRows = await User.find(peopleFilter)
        .select("name email role departmentId")
        .populate("departmentId", "name")
        .limit(MAX_RESULTS)
        .maxTimeMS(DB_QUERY_MAX_TIME_MS)
        .lean();

      for (const row of userRows) {
        people.push({
          id: String(row._id),
          name: row.name,
          email: row.email,
          role: row.role,
          department:
            (row.departmentId as unknown as { name?: string } | null)?.name ?? "",
        });
      }
    }

    return NextResponse.json({ comments, attachments, people });
  } catch (error) {
    console.error("GET /api/search error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
