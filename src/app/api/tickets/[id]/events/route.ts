import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongo";
import { Ticket, Comment, TicketReadState } from "@/lib/db/models";
import { requireApiRole, canAccessTicket } from "@/lib/authz";
import { subscribeTicket, type TicketEvent } from "@/lib/events";
import { stripCommentAttachmentData } from "@/lib/attachments";
import mongoose from "mongoose";

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events stream for one ticket's conversation.
 *
 * Client protocol: subscribe with ?after=<ISO cursor>. Every event triggers a
 * bounded delta fetch (only comments newer than the client's own cursor, so
 * bursts can't re-send data the client already has). Includes `retry:` so
 * EventSource reconnects are automatic, and 25s heartbeats so proxies don't
 * kill idle streams.
 *
 * Access: same canAccessTicket matrix as the conversation GET — verified
 * BEFORE the stream opens, and the request is never streamed to anyone the
 * conversation itself would deny.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireApiRole("client", "team", "manager", "super_admin");
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;
  const { id } = await params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return new Response("Invalid ticket ID", { status: 400 });
  }
  await connectDB();
  const ticket = await Ticket.findById(id).lean();
  if (!ticket) {
    return new Response("Ticket not found", { status: 404 });
  }
  const canAccess = canAccessTicket(
    user.role,
    user.id,
    ticket.requesterId.toString(),
    ticket.assigneeId?.toString(),
    ticket.departmentId?.toString(),
    user.departmentId,
    ticket.transfer,
    user.ticketAccess
  );
  if (!canAccess) {
    return new Response("Forbidden", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  // The client owns its cursor; the server never sends what the client
  // already has. Seeded from ?after= so reconnects don't replay history.
  let cursor: string | null = searchParams.get("after");

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };
      send("open", { at: new Date().toISOString() });

      const pushComments = async (isReadEvent = false) => {
        if (closed) return;
        try {
          // Read events don't carry new messages — they advance ✓ → ✓✓ on
          // OTHER viewers' own bubbles. Send the receipt update even when
          // there are no fresh comments.
          const filter: Record<string, unknown> = { ticketId: id };
          if (cursor) filter.createdAt = { $gt: new Date(cursor) };
          if (user.role === "client") filter.visibility = "public";
          const fresh = await Comment.find(filter)
            .sort({ createdAt: 1 })
            .limit(100)
            .populate("authorId", "name email role")
            .lean();
          if (fresh.length) {
            cursor = (fresh[fresh.length - 1] as { createdAt: Date }).createdAt.toISOString();
            send("comments", {
              comments: (fresh as unknown as Record<string, unknown>[]).map(stripCommentAttachmentData),
              serverTime: new Date().toISOString(),
            });
          } else if (isReadEvent) {
            // Still refresh receipts (othersReadAt may have moved).
            send("read", { at: new Date().toISOString() });
          }
          // Reading the stream advances the read marker (✓✓ for senders).
          void TicketReadState.updateOne(
            { userId: user.id, ticketId: id },
            { $set: { lastReadAt: new Date() } },
            { upsert: true }
          ).exec();
        } catch {
          // Transient DB hiccup: the next event/heartbeat retries.
        }
      };

      // Initial state right after open: anything newer than the client's cursor.
      void pushComments();

      const unsubscribe = subscribeTicket(id, (event: TicketEvent) => {
        if (event.type === "comment") void pushComments(false);
        else if (event.type === "read") void pushComments(true);
      });

      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          closed = true;
        }
      }, 25_000);

      const abort = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed by the platform
        }
      };
      request.signal.addEventListener("abort", abort);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
