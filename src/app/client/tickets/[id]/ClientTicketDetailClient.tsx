"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { TicketDetail } from "@/components/tickets";
import type { ChatParticipant } from "@/components/tickets/ConversationPanel";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertTriangle, TicketCheck } from "lucide-react";
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
        if (ticketRes.status === 404) throw new Error("Ticket not found");
        throw new Error("Failed to fetch ticket");
      }

      const ticketData = await ticketRes.json();
      const commentsData = await commentsRes.json();
      const userData = await userRes.json();

      setTicket(ticketData.ticket);
      setComments(commentsData.comments || []);
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
    const res = await fetch(`/api/tickets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error("Failed to update ticket");
    const data = await res.json();
    setTicket(data.ticket);
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
    setComments((prev) => [...prev, data.comment]);
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
              const fresh = incoming.filter((c) => !seen.has(c._id?.toString()));
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
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-6 w-1/3 rounded bg-muted" />
            <div className="h-4 w-1/2 rounded bg-muted" />
          </div>
        </div>
        {/* Matches the detail layout: main column + 320px sidebar */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            <div className="h-64 rounded-xl bg-muted" />
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3">
                  <div className="h-8 w-8 rounded-full bg-muted" />
                  <div className="h-12 flex-1 rounded-xl bg-muted" />
                </div>
              ))}
            </div>
          </div>
          <div className="hidden space-y-4 lg:block">
            <div className="h-10 rounded-lg bg-muted" />
            <div className="space-y-3 rounded-xl border border-border p-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="h-3 w-16 rounded bg-muted" />
                  <div className="h-3 w-24 rounded bg-muted" />
                </div>
              ))}
            </div>
          </div>
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
        ticket={ticket}
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