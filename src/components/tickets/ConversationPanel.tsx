"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UserAvatar } from "./badges";
import type { IComment as CommentModel, IUser as UserType } from "@/lib/db/models";
import { Download, Pencil, Trash2, X, Check, Paperclip, Lock, MessageSquareDashed, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Timestamp } from "@/components/ui/timestamp";
import { cn } from "@/lib/utils";

type AnyComment = CommentModel & { authorId?: UserType };

/** A resolved chat party, rendered in the conversation header. */
export interface ChatParticipant {
  id: string;
  name: string;
  role: string;
  kind: "sender" | "manager" | "agent";
}

interface ConversationPanelProps {
  ticketId: string;
  comments: AnyComment[];
  currentUserId: string;
  currentUserRole: string;
  ticketStatus: string;
  /** Whether the viewer is a chat party (sender / owning manager / assignee).
   *  Non-participants (incl. super admins) see the thread read-only. */
  canPost: boolean;
  /** The conversation's parties, resolved by the server. */
  chatParticipants?: ChatParticipant[];
  onAddComment: (body: string, attachment?: File, visibility?: "public" | "internal") => Promise<void>;
  onCommentsChanged?: () => void;
  /** Incremented by the parent on every live SSE push — drives receipt refresh. */
  liveEventCount?: number;
}

/** Bounded edit window for your own messages (WhatsApp-like). */
const EDIT_WINDOW_MS = 15 * 60 * 1000;

/**
 * WhatsApp-style conversation:
 *  - EVERY human message renders as a bubble — own messages right-aligned,
 *    everyone else's left-aligned with avatar + name (all users, all roles).
 *  - Own bubbles carry receipts: ✓ sent, ✓✓ grey delivered, ✓✓ blue read.
 *  - System events (status/assignment/transfers) render as centered dividers.
 *  - Internal notes stay staff-only (server-enforced); amber styling.
 *  - Sends are optimistic: the bubble appears instantly with a clock, then
 *    ✓ / ✓✓ grey / ✓✓ blue as the server + other parties confirm.
 *  - Closed tickets freeze the thread (composer replaced by a notice).
 */
export function ConversationPanel({
  ticketId,
  comments,
  currentUserId,
  currentUserRole,
  ticketStatus,
  canPost,
  chatParticipants,
  onAddComment,
  onCommentsChanged,
  liveEventCount,
}: ConversationPanelProps) {
  const isStaff = ["team", "manager", "super_admin"].includes(currentUserRole);
  const isClosed = ticketStatus === "closed";

  const [replyText, setReplyText] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [internal, setInternal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // ---- receipts -------------------------------------------------------------
  // Read markers of the participants OTHER than me — the max of their
  // lastReadAt turns my bubbles' ✓✓ grey into ✓✓ blue.
  const [othersReadAt, setOthersReadAt] = useState<Date | null>(null);

  const refreshReadState = useCallback(async () => {
    try {
      const res = await fetch(`/api/tickets/${ticketId}/read-state`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const others = (data.readStates as { userId: string; lastReadAt: string }[]).filter(
          (r) => r.userId !== currentUserId
        );
        const latest = others.reduce<Date | null>((acc, r) => {
          const d = new Date(r.lastReadAt);
          return !acc || d > acc ? d : acc;
        }, null);
        setOthersReadAt(latest);
      }
    } catch {
      // receipts are best-effort
    }
  }, [ticketId, currentUserId]);

  useEffect(() => {
    refreshReadState();
    const id = setInterval(refreshReadState, 5000);
    return () => clearInterval(id);
  }, [refreshReadState]);

  // Live SSE: the parent bumps liveEventCount on every push; refresh receipts
  // so senders see ✓ → ✓✓ blue without waiting for the 5s poll.
  const firstLiveRef = useRef(true);
  useEffect(() => {
    if (liveEventCount === undefined) return;
    if (firstLiveRef.current) {
      firstLiveRef.current = false;
      return;
    }
    refreshReadState();
  }, [liveEventCount, refreshReadState]);

  // ---- optimistic local messages -------------------------------------------
  interface PendingMsg {
    localId: string;
    body: string;
    visibility: "public" | "internal";
    hasAttachment: boolean;
    attachmentName?: string;
    state: "sending" | "sent" | "failed";
  }
  const [pending, setPending] = useState<PendingMsg[]>([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 4 * 1024 * 1024) {
      setFormError("File must be under 4MB.");
      return;
    }
    setFormError("");
    setAttachment(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    if (f.size > 4 * 1024 * 1024) {
      setFormError("File must be under 4MB.");
      return;
    }
    setAttachment(f);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isClosed) return;
    if (!replyText.trim() && !attachment) return;

    const bodyText = replyText;
    const att = attachment;
    const vis = internal ? "internal" : "public";
    const localId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Optimistic: show it right now as "sending" (clock state).
    setPending((p) => [
      ...p,
      {
        localId,
        body: bodyText || `📎 ${att?.name ?? "attachment"}`,
        visibility: vis,
        hasAttachment: !!att,
        attachmentName: att?.name,
        state: "sending",
      },
    ]);
    setReplyText("");
    setAttachment(null);
    setIsSubmitting(true);
    setFormError("");

    try {
      await onAddComment(bodyText, att || undefined, vis);
      setPending((p) => p.map((m) => (m.localId === localId ? { ...m, state: "sent" } : m)));
      // The authoritative copy arrives via SSE/poll; drop the optimistic
      // copy shortly after so we don't double-render.
      setTimeout(() => {
        setPending((p) => p.filter((m) => m.localId !== localId));
      }, 1500);
    } catch {
      setPending((p) => p.map((m) => (m.localId === localId ? { ...m, state: "failed" } : m)));
      setFormError("Couldn't send your message. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEdit = (comment: CommentModel) => {
    setEditingId(comment._id.toString());
    setEditText(comment.body);
    setEditError("");
  };

  const saveEdit = async (comment: CommentModel) => {
    const content = editText.trim();
    if (!content) return;
    setSavingEdit(true);
    setEditError("");
    try {
      const res = await fetch(`/api/tickets/${comment.ticketId}/comments/${comment._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: content }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || "Failed to update message");
      }
      cancelEdit();
      onCommentsChanged?.();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Failed to update message");
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteComment = async (comment: CommentModel) => {
    const commentId = comment._id.toString();
    if (confirmDeleteId !== commentId) {
      setConfirmDeleteId(commentId);
      return;
    }
    setConfirmDeleteId(null);
    setDeletingId(commentId);
    try {
      const res = await fetch(`/api/tickets/${comment.ticketId}/comments/${comment._id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete message");
      onCommentsChanged?.();
    } catch (error) {
      console.error("Failed to delete message:", error);
    } finally {
      setDeletingId(null);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
    setEditError("");
  };

  // Autoscroll on new content.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [comments.length, pending.length]);

  const othersHaveRead = (d: Date) => othersReadAt && othersReadAt >= d;

  const kindLabel: Record<ChatParticipant["kind"], string> = {
    sender: "Sender",
    manager: "Manager",
    agent: "Agent",
  };

  /** Receipt stack for MY bubbles: ✓ / ✓✓ grey / ✓✓ blue. */
  const Receipts = ({ createdAt, delivered, internal }: { createdAt: Date; delivered: boolean; internal: boolean }) => {
    if (internal) return null; // staff-only notes have no client-side receipts
    const read = othersHaveRead(createdAt);
    return (
      <span className="inline-flex items-center" aria-label={read ? "Read" : delivered ? "Delivered" : "Sent"}>
        {read ? (
          <CheckCheck className="h-3.5 w-3.5 text-sky-500" aria-label="Read" />
        ) : delivered ? (
          <CheckCheck className="h-3.5 w-3.5 opacity-70" aria-label="Delivered" />
        ) : (
          <Check className="h-3 w-3 opacity-70" aria-label="Sent" />
        )}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Chat roster — the parties this conversation is between (resolved
          server-side so the UI can't drift from the access rule). */}
      {chatParticipants && chatParticipants.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-muted/20 px-3 py-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            In this conversation
          </span>
          <div className="flex flex-wrap items-center gap-3">
            {chatParticipants.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1.5" title={`${p.name} · ${kindLabel[p.kind]}`}>
                <UserAvatar name={p.name} size="sm" />
                <span className="text-sm font-medium text-foreground">{p.name}</span>
                <span className="text-[11px] text-muted-foreground">· {kindLabel[p.kind]}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Conversation */}
      <div
        ref={scrollRef}
        className="max-h-[60vh] space-y-1 overflow-y-auto rounded-xl border border-border bg-muted/20 p-4"
        aria-label="Conversation"
      >
        {comments.length === 0 && pending.length === 0 && (
          <div className="py-8 text-center">
            <MessageSquareDashed className="mx-auto mb-2 h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">
              {isStaff ? "No messages yet. Start the conversation below." : "No messages yet — our team is on it. Say hi!"}
            </p>
          </div>
        )}

        {comments.map((comment) => {
          const author = comment.authorId as UserType | undefined;
          const isOwn = author?._id?.toString() === currentUserId;
          const isSystem = (comment as { kind?: string }).kind === "system";
          const isInternal = (comment as { visibility?: string }).visibility === "internal";
          const commentId = comment._id.toString();
          const isEditing = editingId === commentId;
          const withinEditWindow = Date.now() - new Date(comment.createdAt).getTime() < EDIT_WINDOW_MS;
          const canEdit = isOwn && !isSystem && !isClosed && withinEditWindow;
          const canDelete = (isOwn && !isSystem) || currentUserRole === "super_admin";
          const hasAttachment = !!comment.attachment;
          const createdAt = new Date(comment.createdAt);

          // System events: centered divider — no avatar, no bubble.
          if (isSystem) {
            return (
              <div key={commentId} className="flex items-center gap-3 py-2" aria-label="Event">
                <div className="h-px flex-1 bg-border" />
                <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                  {comment.body} · <Timestamp date={comment.createdAt} />
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
            );
          }

          if (isOwn) {
            // MY message: right-aligned bubble with receipts.
            return (
              <div key={commentId} className="flex justify-end py-1.5">
                <div
                  className={cn(
                    "group max-w-[85%] rounded-2xl rounded-br-sm px-4 py-2.5",
                    isInternal
                      ? "border border-warning/40 bg-warning-muted"
                      : "bg-primary text-primary-foreground"
                  )}
                  aria-label={`Your message${isInternal ? " (internal)" : ""}`}
                >
                  {isInternal && (
                    <span className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-warning">
                      <Lock className="h-3 w-3" aria-hidden /> Internal
                    </span>
                  )}
                  {isEditing ? (
                    <div className="space-y-2">
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="w-full resize-none rounded-lg border border-border bg-background p-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        rows={3}
                        disabled={savingEdit}
                        aria-label="Edit message"
                      />
                      {editError && <p className="text-xs text-destructive" role="alert">{editError}</p>}
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="ghost" size="sm" onClick={cancelEdit} disabled={savingEdit}>
                          <X className="mr-1 h-3.5 w-3.5" /> Cancel
                        </Button>
                        <Button type="button" size="sm" onClick={() => saveEdit(comment)} loading={savingEdit} disabled={!editText.trim()}>
                          <Check className="mr-1 h-3.5 w-3.5" /> Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{comment.body}</p>
                      {hasAttachment && comment.attachment && (
                        <a
                          href={`/api/tickets/${comment.ticketId}/attachments/${comment._id}`}
                          className="mt-1.5 inline-flex max-w-full items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-sm hover:border-primary/30"
                          download
                        >
                          <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                          <span className="truncate font-medium">{comment.attachment.name}</span>
                          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                            {(comment.attachment.size / 1024).toFixed(1)} KB
                          </span>
                        </a>
                      )}
                      <div className="mt-1 flex items-center justify-end gap-1.5 text-[11px] opacity-80">
                        <Timestamp date={comment.createdAt} />
                        <Receipts createdAt={createdAt} delivered={!!comment.deliveredAt} internal={isInternal} />
                        {(canEdit || canDelete) && (
                          <span className="inline-flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                            {canEdit && (
                              <button type="button" onClick={() => startEdit(comment)} className="rounded p-0.5" aria-label="Edit message">
                                <Pencil className="h-3 w-3" aria-hidden />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => deleteComment(comment)}
                                disabled={deletingId === commentId}
                                className={cn(
                                  "rounded p-0.5",
                                  confirmDeleteId === commentId ? "font-semibold underline" : ""
                                )}
                                aria-label={confirmDeleteId === commentId ? "Confirm delete message" : "Delete message"}
                              >
                                {confirmDeleteId === commentId ? "Confirm?" : <Trash2 className="h-3 w-3" aria-hidden />}
                              </button>
                            )}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          }

          // EVERYONE ELSE: left-aligned bubble with avatar + name (all roles).
          return (
            <div key={commentId} className="flex items-end gap-2 py-1.5" aria-label={`Message by ${author?.name || "unknown"}`}>
              <UserAvatar name={author?.name || "Unknown"} role={author?.role as any} size="sm" />
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl rounded-bl-sm px-4 py-2.5",
                  isInternal
                    ? "border border-warning/40 bg-warning-muted"
                    : "border border-border bg-background"
                )}
              >
                <div className="mb-0.5 flex flex-wrap items-center gap-x-2">
                  <span className="text-xs font-semibold text-foreground">{author?.name || "Unknown"}</span>
                  {isInternal && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-warning">
                      <Lock className="h-3 w-3" aria-hidden /> Internal
                    </span>
                  )}
                  <Timestamp date={comment.createdAt} className="font-mono text-[10px] text-muted-foreground" />
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{comment.body}</p>
                {hasAttachment && comment.attachment && (
                  <a
                    href={`/api/tickets/${comment.ticketId}/attachments/${comment._id}`}
                    className="mt-1.5 inline-flex max-w-full items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-sm hover:border-primary/30"
                    download
                  >
                    <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="truncate font-medium">{comment.attachment.name}</span>
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                      {(comment.attachment.size / 1024).toFixed(1)} KB
                    </span>
                  </a>
                )}
              </div>
            </div>
          );
        })}

        {/* Optimistic pending messages */}
        {pending.map((m) => (
          <div key={m.localId} className="flex justify-end py-1.5">
            <div
              className={cn(
                "max-w-[85%] rounded-2xl rounded-br-sm px-4 py-2.5 opacity-90",
                m.visibility === "internal" ? "border border-warning/40 bg-warning-muted" : "bg-primary text-primary-foreground"
              )}
              aria-label={`Sending${m.visibility === "internal" ? " internal note" : ""}`}
            >
              {m.visibility === "internal" && (
                <span className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-warning">
                  <Lock className="h-3 w-3" aria-hidden /> Internal
                </span>
              )}
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.body}</p>
              <div className="mt-1 flex items-center justify-end gap-1 text-[11px] opacity-80">
                {m.state === "sending" && (
                  <span aria-live="polite" className="inline-flex items-center gap-1">
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                    Sending…
                  </span>
                )}
                {m.state === "sent" && <Check className="h-3 w-3 opacity-70" aria-label="Sent" />}
                {m.state === "failed" && <span className="font-medium text-destructive">Failed</span>}
              </div>
            </div>
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Closed gate / read-only oversight */}
      {isClosed ? (
        <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-center text-sm text-muted-foreground" role="status">
          🔒 This conversation is frozen — the ticket is closed. Reopen the ticket to continue it.
        </div>
      ) : !canPost ? (
        <div
          className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-center text-sm text-muted-foreground"
          role="status"
        >
          <MessageSquareDashed className="mx-auto mb-1 h-4 w-4" aria-hidden />
          Read-only — the conversation is between the sender, the department manager, and the assigned agent.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          {formError && (
            <p className="rounded-lg border border-destructive/20 bg-destructive-muted px-3 py-2 text-sm text-destructive" role="alert">
              {formError}
            </p>
          )}
          {attachment && (
            <div className="flex items-center gap-2 rounded-lg bg-muted p-2">
              <div className="flex h-8 w-8 items-center justify-center rounded bg-primary/10 text-primary">
                <Paperclip className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{attachment.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(attachment.size / 1024).toFixed(1)} KB • {attachment.type}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => {
                  setAttachment(null);
                  setFormError("");
                }}
                className="text-muted-foreground hover:text-destructive"
                aria-label="Remove attachment"
              >
                <X className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          )}

          <div
            className={cn(
              "rounded-xl border p-1 transition-colors",
              dragActive ? "border-dashed border-primary bg-primary/5" : "border-border"
            )}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileChange}
                className="hidden"
                accept="image/*,application/pdf,.doc,.docx,.txt,.csv,.zip"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={!!attachment || isSubmitting}
                className="h-10"
                aria-label="Attach a file"
              >
                <Paperclip className="h-4 w-4" aria-hidden />
              </Button>

              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={internal ? "Internal note — clients never see this…" : "Write a message…"}
                className="flex-1 resize-none border-none bg-transparent text-sm focus:outline-none"
                rows={2}
                disabled={isSubmitting}
                aria-label={internal ? "Add an internal note" : "Write a message"}
              />

              {isStaff && (
                <label className="flex cursor-pointer items-center gap-1.5 self-center rounded-lg px-2 py-1 text-xs font-medium text-warning hover:bg-warning-muted" title="Only staff can see internal notes">
                  <input
                    type="checkbox"
                    checked={internal}
                    onChange={(e) => setInternal(e.target.checked)}
                    className="accent-warning"
                    aria-label="Internal note (staff only)"
                  />
                  Internal
                </label>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" size="sm" loading={isSubmitting} disabled={!replyText.trim() && !attachment}>
              {internal ? "Add internal note" : "Send"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
