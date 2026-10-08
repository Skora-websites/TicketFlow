"use client";

import { useState, useRef } from "react";
import { UserAvatar } from "./badges";
import type { IComment as CommentModel, IUser as UserType } from "@/lib/db/models";
import { Download, Pencil, Trash2, X, Check, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Timestamp } from "@/components/ui/timestamp";
import { cn } from "@/lib/utils";

interface CommentThreadProps {
  comments: (CommentModel & { authorId?: UserType })[];
  currentUserId: string;
  currentUserRole: string;
  onAddComment: (body: string, attachment?: File) => Promise<void>;
  onCommentsChanged?: () => void;
}

export function CommentThread({
  comments,
  currentUserId,
  currentUserRole,
  onAddComment,
  onCommentsChanged,
}: CommentThreadProps) {
  const [replyText, setReplyText] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
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

  const startEdit = (comment: CommentModel) => {
    setEditingId(comment._id.toString());
    setEditText(comment.body);
    setEditError("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
    setEditError("");
  };

  const saveEdit = async (comment: CommentModel) => {
    const content = editText.trim();
    if (!content) return;
    setSavingEdit(true);
    setEditError("");
    try {
      const res = await fetch(
        `/api/tickets/${comment.ticketId}/comments/${comment._id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: content }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update comment");
      }
      cancelEdit();
      onCommentsChanged?.();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Failed to update comment");
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
      const res = await fetch(
        `/api/tickets/${comment.ticketId}/comments/${comment._id}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to delete comment");
      }
      onCommentsChanged?.();
    } catch (error) {
      console.error("Failed to delete comment:", error);
    } finally {
      setDeletingId(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 4 * 1024 * 1024) {
        setFormError("File must be under 4MB.");
        return;
      }
      setFormError("");
      setAttachment(file);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.size > 4 * 1024 * 1024) {
        setFormError("File must be under 4MB.");
        return;
      }
      setFormError("");
      setAttachment(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() && !attachment) return;

    setIsSubmitting(true);
    setFormError("");
    try {
      await onAddComment(replyText, attachment || undefined);
      setReplyText("");
      setAttachment(null);
    } catch {
      setFormError("Couldn't post your reply. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const removeAttachment = () => {
    setAttachment(null);
    setFormError("");
  };

  return (
    <div className="space-y-4">
      {/* Case log — chronological record, not a chat. Every entry reads the
          same left-to-right: who, when, what. No mirrored bubbles. */}
      <div className="divide-y divide-border border-y border-border">
        {comments.map((comment, i) => {
          const author = comment.authorId as UserType | undefined;
          const isOwn = author?._id?.toString() === currentUserId;
          const hasAttachment = !!comment.attachment;
          const commentId = comment._id.toString();
          const isEditing = editingId === commentId;
          const canEdit = isOwn;
          const canDelete = isOwn || currentUserRole === "super_admin";

          return (
            <article
              key={commentId}
              className="flex gap-3 py-4"
              aria-label={`Note ${i + 1} by ${isOwn ? "you" : author?.name || "unknown"}`}
            >
              <UserAvatar
                name={author?.name || "Unknown"}
                role={(isOwn ? currentUserRole : author?.role) as any}
                size="sm"
              />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-sm font-medium text-foreground">
                    {isOwn ? "You" : author?.name || "Unknown"}
                  </span>
                  <Timestamp date={comment.createdAt} className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground" />
                  {comment.updatedAt && (
                    <span className="font-mono text-[11px] text-muted-foreground/70">(edited)</span>
                  )}
                  {!isEditing && (canEdit || canDelete) && (
                    <span className="ml-auto inline-flex items-center gap-0.5">
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => startEdit(comment)}
                          className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                          aria-label="Edit note"
                        >
                          <Pencil className="h-3 w-3" aria-hidden />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => deleteComment(comment)}
                          onBlur={() => {
                            if (confirmDeleteId === commentId) setConfirmDeleteId(null);
                          }}
                          disabled={deletingId === commentId}
                          className={cn(
                            "rounded p-1 transition-colors disabled:opacity-50",
                            confirmDeleteId === commentId
                              ? "bg-destructive/10 px-2 text-xs font-medium text-destructive hover:bg-destructive hover:text-destructive-foreground"
                              : "text-muted-foreground hover:text-destructive"
                          )}
                          aria-label={confirmDeleteId === commentId ? "Confirm delete note" : "Delete note"}
                        >
                          {confirmDeleteId === commentId ? (
                            "Confirm?"
                          ) : (
                            <Trash2 className="h-3 w-3" aria-hidden />
                          )}
                        </button>
                      )}
                    </span>
                  )}
                </div>
                {isEditing ? (
                  <div className="mt-2 space-y-2">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="w-full resize-none rounded-lg border border-border bg-background p-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      rows={3}
                      disabled={savingEdit}
                      aria-label="Edit note"
                    />
                    {editError && (
                      <p className="text-xs text-destructive" role="alert">{editError}</p>
                    )}
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={cancelEdit}
                        disabled={savingEdit}
                      >
                        <X className="mr-1 h-3.5 w-3.5" /> Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => saveEdit(comment)}
                        loading={savingEdit}
                        disabled={!editText.trim()}
                      >
                        <Check className="mr-1 h-3.5 w-3.5" /> Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{comment.body}</p>
                )}

                {hasAttachment && comment.attachment && (
                  <a
                    href={`/api/tickets/${comment.ticketId}/attachments/${comment._id}`}
                    className="mt-2 inline-flex max-w-full items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-sm hover:border-primary/30 hover:text-foreground"
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
            </article>
          );
        })}

        {comments.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">No notes yet. Record the first one below.</p>
          </div>
        )}
      </div>

      {/* Reply form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        {formError && (
          <p className="rounded-lg border border-destructive/20 bg-destructive-muted px-3 py-2 text-sm text-destructive" role="alert">
            {formError}
          </p>
        )}
        {attachment && (
          <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
            <div className="w-8 h-8 rounded flex items-center justify-center bg-primary/10 text-primary">
              <Download className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{attachment.name}</p>
              <p className="text-xs text-muted-foreground">
                {(attachment.size / 1024).toFixed(1)} KB • {attachment.type}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={removeAttachment}
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
            dragActive
              ? "border-dashed border-primary bg-primary/5"
              : "border-dashed border-border"
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
            >
              <Paperclip className="mr-1 h-4 w-4" aria-hidden />
              Attach
            </Button>

            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Add a note to the record…"
              className="flex-1 bg-transparent border-none resize-none focus:outline-none text-sm"
              rows={3}
              disabled={isSubmitting}
              aria-label="Add a note"
            />
          </div>
        </div>

        <Button
          type="submit"
          className="w-full sm:w-auto ml-auto"
          size="sm"
          loading={isSubmitting}
          disabled={!replyText.trim() && !attachment}
        >
          Add note
        </Button>
      </form>
    </div>
  );
}