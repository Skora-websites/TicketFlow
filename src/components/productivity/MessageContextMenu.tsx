"use client";

import React, { useState } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/toast";
import {
  Copy,
  Link2,
  Reply,
  Pencil,
  Trash2,
  RotateCcw,
  Lock,
} from "lucide-react";

export interface MessageContextMenuProps {
  message: {
    _id: string;
    body: string;
    createdAt?: Date | string;
    authorId?: { _id?: string; name?: string; role?: string } | string;
    visibility?: string;
    kind?: string;
  };
  ticketId: string;
  ticketStatus?: string;
  currentUserId?: string;
  currentUserRole?: string;
  isFailed?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  onRetry?: () => void;
  onReply?: (body: string, authorName: string) => void;
  onEdit?: () => void;
  onDelete?: () => Promise<void> | void;
  disabled?: boolean;
  children: React.ReactNode;
}

export function MessageContextMenu({
  message,
  ticketId,
  ticketStatus,
  currentUserId,
  currentUserRole = "client",
  isFailed = false,
  canEdit,
  canDelete,
  onRetry,
  onReply,
  onEdit,
  onDelete,
  disabled = false,
  children,
}: MessageContextMenuProps) {
  const { toast } = useToast();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const authorObj =
    typeof message.authorId === "object" ? message.authorId : null;
  const authorIdStr =
    authorObj?._id?.toString() ||
    (typeof message.authorId === "string" ? message.authorId : "");
  const authorName = authorObj?.name || "Author";

  const isOwn = currentUserId && authorIdStr ? authorIdStr === currentUserId : false;
  const isInternal = message.visibility === "internal";
  const isSystem = message.kind === "system";
  const isClosed = ticketStatus === "closed";

  const resolvedCanEdit =
    canEdit !== undefined ? canEdit : isOwn && !isSystem && !isClosed;
  const resolvedCanDelete =
    canDelete !== undefined ? canDelete : (isOwn && !isSystem) || currentUserRole === "super_admin";

  const handleCopyText = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(message.body);
      toast({
        title: "Copied to clipboard",
        description: message.body.length > 50 ? `${message.body.slice(0, 50)}…` : message.body,
      });
    } catch {
      toast({ title: "Failed to copy text", variant: "destructive" });
    }
  };

  const handleCopyLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const link = `${window.location.origin}/dashboard/tickets/${ticketId}#comment-${message._id}`;
      await navigator.clipboard.writeText(link);
      toast({
        title: "Link copied",
        description: "Direct link to comment copied to clipboard",
      });
    } catch {
      toast({ title: "Failed to copy link", variant: "destructive" });
    }
  };

  const handleReply = () => {
    if (onReply) {
      onReply(message.body, authorName);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!onDelete) return;
    setIsDeleting(true);
    try {
      await onDelete();
      setShowDeleteConfirm(false);
      toast({
        title: "Deleted",
        description: isInternal ? "Internal note deleted" : "Message deleted",
      });
    } catch (err) {
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Failed to delete",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  if (disabled || isSystem) {
    return <>{children}</>;
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent className="w-52">
          <ContextMenuLabel className="flex items-center gap-1.5 truncate">
            {isInternal ? (
              <>
                <Lock className="h-3 w-3 text-warning shrink-0" />
                <span className="text-warning">Internal Note</span>
              </>
            ) : (
              <span>Message by {isOwn ? "You" : authorName}</span>
            )}
          </ContextMenuLabel>
          <ContextMenuSeparator />

          {/* Failed Retry Option */}
          {isFailed && onRetry && (
            <>
              <ContextMenuItem onClick={onRetry} className="text-primary font-semibold">
                <RotateCcw className="h-4 w-4" />
                <span>Retry Message</span>
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          )}

          {/* Copy Message Text */}
          <ContextMenuItem onClick={handleCopyText}>
            <Copy className="h-4 w-4 text-muted-foreground" />
            <span>Copy Text</span>
          </ContextMenuItem>

          {/* Copy Message Link */}
          <ContextMenuItem onClick={handleCopyLink}>
            <Link2 className="h-4 w-4 text-muted-foreground" />
            <span>Copy Link</span>
          </ContextMenuItem>

          {/* Reply in thread */}
          {onReply && !isClosed && (
            <ContextMenuItem onClick={handleReply}>
              <Reply className="h-4 w-4 text-muted-foreground" />
              <span>Reply</span>
            </ContextMenuItem>
          )}

          {/* Edit own message */}
          {resolvedCanEdit && onEdit && (
            <ContextMenuItem onClick={onEdit}>
              <Pencil className="h-4 w-4 text-muted-foreground" />
              <span>Edit Message</span>
            </ContextMenuItem>
          )}

          {/* Delete message (Destructive) */}
          {resolvedCanDelete && onDelete && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                variant="destructive"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
                <span>Delete Message</span>
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>

      {/* Delete Confirmation Alert Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this {isInternal ? "note" : "message"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The {isInternal ? "internal note" : "message"} will be permanently removed from this ticket thread.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteConfirm();
              }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
