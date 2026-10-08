"use client";

import { useEffect, useState } from "react";
import { Eye, Users } from "lucide-react";
import { UserAvatar } from "./badges";

export interface Viewer {
  id: string;
  name: string;
  role: string;
  lastSeenAt: number | null;
}

const POLL_MS = 10_000; // presence TTL is 30s — poll well inside it

/**
 * Collision detection chip (UX-IDEAS X2, Freshdesk-style): shows which OTHER
 * staff members are currently viewing this ticket. Polls the presence
 * endpoint every 10s; the POST touch keeps this user's own presence alive.
 * Renders nothing for clients, solo viewers, or while loading.
 */
export function ViewersChip({ ticketId, isClient }: { ticketId: string; isClient: boolean }) {
  const [viewers, setViewers] = useState<Viewer[]>([]);

  useEffect(() => {
    if (isClient) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(`/api/tickets/${ticketId}/presence`, { method: "POST" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setViewers(data.viewers ?? []);
      } catch {
        // Presence is decorative — network hiccups just leave the last state.
      }
    };

    void poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [ticketId, isClient]);

  if (isClient || viewers.length === 0) return null;

  const label =
    viewers.length === 1
      ? `${viewers[0].name} is viewing`
      : `${viewers.length} people are viewing`;

  return (
    <div
      className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 py-1 pl-1 pr-3 text-xs text-muted-foreground"
      title={viewers.map((v) => v.name).join(", ")}
      aria-label={label}
    >
      {viewers.length === 1 ? (
        <>
          <UserAvatar name={viewers[0].name} size="sm" role={viewers[0].role} />
          <span className="font-medium text-foreground">{viewers[0].name}</span>
          <Eye className="h-3 w-3" aria-hidden />
        </>
      ) : (
        <>
          <Users className="h-3 w-3" aria-hidden />
          <span className="font-medium text-foreground">{viewers.length} viewing</span>
          <span className="max-w-[180px] truncate">{viewers.map((v) => v.name.split(" ")[0]).join(", ")}</span>
        </>
      )}
    </div>
  );
}
