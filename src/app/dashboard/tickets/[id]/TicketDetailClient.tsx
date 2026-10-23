"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { TicketDetail } from "@/components/tickets";
import type { ChatParticipant } from "@/components/tickets/ConversationPanel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  ArrowLeft,
  AlertTriangle,
  TicketCheck,
} from "lucide-react";
import Link from "next/link";
import type { ITicket, IComment, IUser } from "@/lib/db/models";

export function TicketDetailPage() {
  const router = useRouter();
  const { id } = useParams();

  const [ticket, setTicket] = useState<(ITicket & {
    requesterId?: IUser;
    assigneeId?: IUser;
    departmentId?: any;
    assignedBy?: IUser;
  }) | null>(null);
  const [comments, setComments] = useState<(IComment & { authorId?: IUser })[]>([]);
  const [chatParticipants, setChatParticipants] = useState<ChatParticipant[]>([]);
  const [currentUser, setCurrentUser] = useState<{ id: string; role: string; departmentId?: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  // Live SSE: bump counter on every push so children refresh receipts; the
  // EventSource ref lets tests/HMR tear it down cleanly.
  const [liveEventCount, setLiveEventCount] = useState(0);
  const [sseLive, setSseLive] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [ticketRes, commentsRes, userRes] = await Promise.all([
        fetch(`/api/tickets/${id}`),
        fetch(`/api/tickets/${id}/comments`),
        fetch("/api/auth/me"), // We'll need to create this or get from session
      ]);

      if (!ticketRes.ok) {
        if (ticketRes.status === 404) throw new Error("Ticket not found");
        throw new Error("Failed to fetch ticket");
      }

      const ticketData = await ticketRes.json();
      const commentsData = await commentsRes.json();
      const userData = await userRes.json();

      setTicket(ticketData.ticket);
      const rawComments = (commentsData.comments || []) as (IComment & { authorId?: IUser })[];
      const seen = new Set<string>();
      const dedupedComments = rawComments.filter((c) => {
        const idStr = c._id?.toString();
        if (!idStr || seen.has(idStr)) return false;
        seen.add(idStr);
        return true;
      });
      setComments(dedupedComments);
      setChatParticipants(ticketData.chatParticipants ?? []);
      setCurrentUser(userData.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ticket");
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleUpdateTicket = async (updates: Partial<ITicket>) => {
    const res = await fetch(`/api/tickets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error("Failed to update ticket");
    const data = await res.json();
    setTicket(data.ticket);
  };

  const handleAddComment = async (body: string, attachment?: File, visibility?: "public" | "internal") => {
    const formData = new FormData();
    formData.append("body", body);
    if (attachment) {
      formData.append("attachment", attachment);
    }
    if (visibility) {
      formData.append("visibility", visibility);
    }
    const res = await fetch(`/api/tickets/${id}/comments`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to send message");
    }
    const data = await res.json();
    if (data.comment) {
      setComments((prev) => {
        const idStr = data.comment._id?.toString();
        if (idStr && prev.some((c) => c._id?.toString() === idStr)) {
          return prev;
        }
        return [...prev, data.comment];
      });
    }
  };

  // Live updates: adaptive delta polling. The cursor (?after=) is held in a
  // ref so the interval is created ONCE per ticket instead of being torn down
  // and recreated after every message (the old effect churned on `comments`).
  // cadence: 2.5s while the tab is visible and the user was recently active,
  // 10s otherwise, and fully paused when the tab is hidden.
  const pollRef = useRef<boolean>(false);
  const cursorRef = useRef<string | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const applyIncoming = useCallback((incoming: (IComment & { authorId?: IUser })[]) => {
    if (!incoming.length) return;
    setComments((prev) => {
      const seen = new Set(prev.map((c) => c._id?.toString()));
      const fresh = incoming.filter((c) => {
        const idStr = c._id?.toString();
        if (!idStr || seen.has(idStr)) return false;
        seen.add(idStr);
        return true;
      });
      return fresh.length ? [...prev, ...fresh] : prev;
    });
  }, []);

  const pollComments = useCallback(async () => {
    if (pollRef.current || document.hidden) return;
    pollRef.current = true;
    try {
      const after = cursorRef.current;
      const url = after
        ? `/api/tickets/${id}/comments?after=${encodeURIComponent(after)}`
        : `/api/tickets/${id}/comments`;
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const incoming = (data.comments || []) as (IComment & { authorId?: IUser })[];
        applyIncoming(incoming);
        if (incoming.length) {
          cursorRef.current = new Date(incoming[incoming.length - 1].createdAt).toISOString();
        } else if (data.serverTime && !after) {
          // First idle tick with no history: park the cursor at server now.
          cursorRef.current = data.serverTime;
        }
      }
    } catch {
      // transient network errors are fine; the next tick retries
    } finally {
      pollRef.current = false;
    }
  }, [id, applyIncoming]);

  // Keep the cursor in sync with locally-sent messages so the next delta
  // fetch doesn't re-download the optimistic bubble's authoritative copy.
  useEffect(() => {
    const last = comments[comments.length - 1];
    if (last) {
      const iso = new Date(last.createdAt).toISOString();
      if (!cursorRef.current || iso > cursorRef.current) cursorRef.current = iso;
    }
  }, [comments]);

  useEffect(() => {
    if (!ticket) return;
    // Comments loaded asynchronously — sync the cursor once they arrive.
    const last = comments[comments.length - 1];
    if (last && !cursorRef.current) {
      cursorRef.current = new Date(last.createdAt).toISOString();
    }

    let lastTickAt = 0;
    const tick = () => {
      const idleMs = Date.now() - lastActivityRef.current;
      const cadence = idleMs < 30_000 ? 2_500 : 10_000;
      if (Date.now() - lastTickAt >= cadence) {
        lastTickAt = Date.now();
        void pollComments();
      }
    };
    const interval = setInterval(tick, 1_000);

    const onVisible = () => {
      if (!document.hidden) {
        lastActivityRef.current = Date.now();
        void pollComments(); // instant refresh when returning to the tab
      }
    };
    const onActivity = () => {
      lastActivityRef.current = Date.now();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("keydown", onActivity, { passive: true });
    window.addEventListener("pointerdown", onActivity, { passive: true });
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("pointerdown", onActivity);
    };
  }, [id, ticket, pollComments]);

  // ---- Real-time: Server-Sent Events ----
  // One EventSource per ticket. The server pushes on every comment/system
  // event; each push carries only comments newer than OUR cursor, and each
  // received batch is merged with dedupe (optimistic bubbles are reconciled
  // by the ConversationPanel's 1.5s drop timer). The delta poll below stays
  // as a safety net for missed events (SSE reconnect gaps, proxy buffering).
  useEffect(() => {
    if (!ticket || !currentUser) return;
    let cancelled = false;
    let lastCountBump = 0;
    const es = new EventSource(`/api/tickets/${id}/events`);

    const merge = (incoming: (IComment & { authorId?: IUser })[]) => {
      if (!incoming.length) return;
      setComments((prev) => {
        const seen = new Set(prev.map((c) => c._id?.toString()));
        const fresh = incoming.filter((c) => {
          const idStr = c._id?.toString();
          if (!idStr || seen.has(idStr)) return false;
          seen.add(idStr);
          return true;
        });
        return fresh.length ? [...prev, ...fresh] : prev;
      });
      const last = incoming[incoming.length - 1];
      if (last) {
        const iso = new Date(last.createdAt).toISOString();
        if (!cursorRef.current || iso > cursorRef.current) cursorRef.current = iso;
      }
      const now = Date.now();
      if (now - lastCountBump > 200) {
        lastCountBump = now;
        setLiveEventCount((n) => n + 1);
      }
    };

    es.addEventListener("open", () => {
      if (!cancelled) setSseLive(true);
    });
    es.addEventListener("comments", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data);
        merge((data.comments || []) as (IComment & { authorId?: IUser })[]);
      } catch {
        // malformed frame — the next poll reconciles
      }
    });
    es.addEventListener("read", () => {
      const now = Date.now();
      if (now - lastCountBump > 200) {
        lastCountBump = now;
        setLiveEventCount((n) => n + 1);
      }
    });
    es.onerror = () => {
      // EventSource auto-reconnects; reflect liveness for the UI badge.
      setSseLive(false);
    };

    return () => {
      cancelled = true;
      es.close();
    };
  }, [id, ticket, currentUser]);

  const handleDeleteTicket = async () => {
    // Confirmation is handled by TicketDetail before this is invoked.
    const res = await fetch(`/api/tickets/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete ticket");
    router.push("/dashboard/tickets");
  };

  if (isLoading) {
    return (
      <div className="space-y-6" aria-label="Loading ticket" aria-busy="true">
        {/* Header */}
        <div>
          <Skeleton className="mb-4 h-5 w-28 rounded-md" />
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <Skeleton className="h-8 w-24 rounded-lg" />
              <Skeleton className="h-8 w-64 sm:w-96 rounded-lg" />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Skeleton className="h-8 w-24 rounded-lg" />
              <Skeleton className="h-8 w-20 rounded-lg" />
            </div>
          </div>
          {/* Meta row */}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-5 w-32 rounded-full" />
          </div>
          {/* Mobile manage jump anchor */}
          <div className="mt-2.5 flex items-center gap-2 lg:hidden">
            <Skeleton className="h-7.5 w-44 rounded-lg" />
          </div>
        </div>

        {/* Main grid: Left column + 320px Sidebar */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* Main column */}
          <div className="min-w-0 space-y-6">
            {/* Description card */}
            <Card>
              <CardHeader>
                <Skeleton className="h-5 w-28 rounded-md" />
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-4 w-full rounded" />
                <Skeleton className="h-4 w-5/6 rounded" />
                <Skeleton className="h-4 w-2/3 rounded" />
              </CardContent>
            </Card>

            {/* Conversation section */}
            <div className="border-t border-border pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-6 w-32 rounded-md" />
                <Skeleton className="h-4 w-24 rounded-md" />
              </div>

              {/* Messages thread */}
              <div className="space-y-4 rounded-xl border border-border/60 bg-secondary/10 p-4">
                {/* Customer bubble (left) */}
                <div className="flex items-start gap-3">
                  <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                  <div className="space-y-1.5 flex-1 max-w-[80%]">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-3.5 w-24 rounded" />
                      <Skeleton className="h-3 w-16 rounded" />
                    </div>
                    <Skeleton className="h-16 w-full rounded-2xl rounded-tl-xs" />
                  </div>
                </div>

                {/* Agent bubble (right) */}
                <div className="flex items-start justify-end gap-3">
                  <div className="space-y-1.5 flex-1 max-w-[80%] flex flex-col items-end">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-3 w-16 rounded" />
                      <Skeleton className="h-3.5 w-20 rounded" />
                    </div>
                    <Skeleton className="h-14 w-full rounded-2xl rounded-tr-xs" />
                  </div>
                  <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                </div>
              </div>

              {/* Composer input box */}
              <div className="rounded-xl border border-border bg-card p-3 space-y-2">
                <Skeleton className="h-20 w-full rounded-lg" />
                <div className="flex items-center justify-between pt-1">
                  <Skeleton className="h-7 w-20 rounded-md" />
                  <Skeleton className="h-8 w-24 rounded-xl" />
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <aside id="ticket-manage-section" className="space-y-4 scroll-mt-16">
            {/* TicketMiniDashboard */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 w-28 rounded-md" />
              </div>
              <div className="space-y-3 pt-1">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <Skeleton className="h-3 w-16 rounded" />
                    <Skeleton className="h-3 w-28 rounded" />
                  </div>
                ))}
              </div>
            </div>

            {/* Quick actions card */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <Skeleton className="h-4 w-24 rounded-md" />
              <div className="space-y-2">
                <Skeleton className="h-3 w-14 rounded" />
                <Skeleton className="h-9 w-full rounded-lg" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-3 w-14 rounded" />
                <Skeleton className="h-9 w-full rounded-lg" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-3 w-16 rounded" />
                <Skeleton className="h-9 w-full rounded-lg" />
              </div>
            </div>

            {/* Details card */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <Skeleton className="h-4 w-20 rounded-md" />
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center justify-between py-1">
                  <Skeleton className="h-3 w-16 rounded" />
                  <Skeleton className="h-3 w-28 rounded" />
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">Failed to load ticket</h2>
        <p className="text-muted-foreground mb-4">{error}</p>
        <Link href="/dashboard/tickets">
          <Button variant="outline">Back to Tickets</Button>
        </Link>
      </div>
    );
  }

  if (!ticket || !currentUser) {
    return (
      <div className="text-center py-12">
        <TicketCheck className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">Ticket not found</h2>
        <Link href="/dashboard/tickets">
          <Button variant="outline">Back to Tickets</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/tickets"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to tickets
      </Link>
      <TicketDetail
        ticket={ticket}
        comments={comments}
        chatParticipants={chatParticipants}
        currentUser={currentUser}
        liveEventCount={liveEventCount}
        sseLive={sseLive}
        onUpdateTicket={handleUpdateTicket}
        onAddComment={handleAddComment}
        onCommentsChanged={loadData}
        onDeleteTicket={handleDeleteTicket}
      />
    </div>
  );
}