"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { TicketDetail } from "@/components/tickets";
import type { ChatParticipant } from "@/components/tickets/ConversationPanel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ArrowLeft, AlertTriangle, TicketCheck, Trash2 } from "lucide-react";
import Link from "next/link";
import type { ITicket, IComment, IUser } from "@/lib/db/models";

export function ClientTicketDetailPage() {
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

  const loadData = useCallback(async () => {
    try {
      const [ticketRes, commentsRes, userRes] = await Promise.all([
        fetch(`/api/tickets/${id}`),
        fetch(`/api/tickets/${id}/comments`),
        fetch("/api/auth/me"),
      ]);

      if (!ticketRes.ok) {
        if (ticketRes.status === 404) throw new Error("This ticket no longer exists");
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

  const handleUpdateTicket = async (updates: Record<string, unknown>) => {
    const previousTicket = ticket;
    setTicket((prev) => (prev ? ({ ...prev, ...updates } as typeof ticket) : null));

    try {
      const res = await fetch(`/api/tickets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update ticket");
      }
      const data = await res.json();
      if (data.ticket) {
        setTicket(data.ticket);
      }
    } catch (err) {
      setTicket(previousTicket);
      throw err;
    }
  };

  const handleAddComment = async (body: string, attachment?: File, _visibility?: "public" | "internal") => {
    // Clients never set visibility — the server ignores/rejects it for them;
    // we simply never send the field. (_visibility: unused by contract.)
    const formData = new FormData();
    formData.append("body", body);
    if (attachment) {
      formData.append("attachment", attachment);
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

  // Live updates for the client portal too — the conversation feels shared.
  const pollRef = useRef<boolean>(false);
  useEffect(() => {
    if (!ticket) return;
    const interval = setInterval(async () => {
      if (pollRef.current || document.hidden) return;
      pollRef.current = true;
      try {
        const last = comments[comments.length - 1];
        const after = last ? new Date(last.createdAt).toISOString() : null;
        const url = after ? `/api/tickets/${id}/comments?after=${encodeURIComponent(after)}` : `/api/tickets/${id}/comments`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          const incoming = (data.comments || []) as (IComment & { authorId?: IUser })[];
          if (incoming.length) {
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
          }
        }
      } catch {
        // transient; next tick retries
      } finally {
        pollRef.current = false;
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [id, ticket, comments]);

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
          </div>
          {/* Meta row for client */}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-5 w-32 rounded-full" />
          </div>
        </div>

        {/* Client single-column main content (clients have no sidebar) */}
        <div className="space-y-6">
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
      </div>
    );
  }

  if (error === "This ticket no longer exists" || (!ticket && !isLoading)) {
    return (
      <div className="text-center py-12 space-y-4">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted/60 text-muted-foreground mx-auto">
          <Trash2 className="w-6 h-6 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">This ticket no longer exists</h2>
          <p className="text-sm text-muted-foreground mt-1">This ticket has been permanently removed or does not exist.</p>
        </div>
        <div>
          <Link href="/client/tickets">
            <Button variant="outline">Back to Tickets</Button>
          </Link>
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
        <Link href="/client/tickets">
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
        <Link href="/client/tickets">
          <Button variant="outline">Back to Tickets</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/client/tickets"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to tickets
      </Link>
      <TicketDetail
        ticket={ticket as any}
        comments={comments}
        chatParticipants={chatParticipants}
        currentUser={currentUser}
        onUpdateTicket={handleUpdateTicket}
        onAddComment={handleAddComment}
        onCommentsChanged={loadData}
      />
    </div>
  );
}