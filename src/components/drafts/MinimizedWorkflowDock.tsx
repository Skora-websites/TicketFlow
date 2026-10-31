"use client";

import React, { useState } from "react";
import { useDraftResume } from "@/lib/drafts/context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  MessageSquare,
  Zap,
  Maximize2,
  Trash2,
  ChevronUp,
  ChevronDown,
  Clock,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";

function getWorkflowIcon(type: string) {
  switch (type) {
    case "ticket":
      return <FileText className="h-4 w-4 text-primary" aria-hidden />;
    case "comment":
      return <MessageSquare className="h-4 w-4 text-info" aria-hidden />;
    case "rule":
      return <Zap className="h-4 w-4 text-warning" aria-hidden />;
    default:
      return <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />;
  }
}

function formatRelativeTime(timestamp: number): string {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  return `${Math.floor(diffHour / 24)}d ago`;
}

export function MinimizedWorkflowDock() {
  const { minimizedDrafts, resumeDraft, discardDraft } = useDraftResume();
  const [isExpanded, setIsExpanded] = useState(false);
  const [confirmingDiscardId, setConfirmingDiscardId] = useState<string | null>(null);

  if (!minimizedDrafts || minimizedDrafts.length === 0) {
    return null;
  }

  const count = minimizedDrafts.length;

  return (
    <aside
      className="fixed bottom-16 sm:bottom-6 right-4 z-50 max-w-sm w-[calc(100vw-2rem)] sm:w-80 select-none animate-in fade-in slide-in-from-bottom-4 duration-200"
      aria-label="Minimized drafts and workflows"
    >
      <div className="rounded-2xl border border-border/80 bg-card/95 backdrop-blur-md shadow-2xl overflow-hidden transition-all duration-200">
        {/* Header bar / collapsed toggle */}
        <div
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center justify-between px-3.5 py-2.5 bg-muted/40 cursor-pointer hover:bg-muted/60 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span>
            </span>
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-muted-foreground" />
              {count === 1 ? "1 Minimized Workflow" : `${count} Minimized Workflows`}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 font-mono">
              Draft
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              aria-label={isExpanded ? "Collapse dock" : "Expand dock"}
            >
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronUp className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>

        {/* List of Minimized Drafts (expanded or single item preview) */}
        <div className={cn("divide-y divide-border/60 transition-all", isExpanded ? "max-h-72 overflow-y-auto" : "max-h-32")}>
          {(isExpanded ? minimizedDrafts : [minimizedDrafts[0]]).map((draft) => {
            const isConfirming = confirmingDiscardId === draft.id;

            return (
              <div key={draft.id} className="p-3 bg-card hover:bg-muted/20 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <div className="p-1.5 rounded-lg bg-muted flex-shrink-0 mt-0.5">
                      {getWorkflowIcon(draft.type)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate leading-tight">
                        {draft.title || "Untitled Draft"}
                      </p>
                      {draft.subtitle && (
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                          {draft.subtitle}
                        </p>
                      )}
                      <span className="text-[10px] text-muted-foreground/80 flex items-center gap-1 mt-1 font-mono">
                        <Clock className="h-3 w-3" />
                        {formatRelativeTime(draft.updatedAt)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    {isConfirming ? (
                      <div className="flex items-center gap-1 bg-destructive/10 p-1 rounded-lg">
                        <span className="text-[10px] text-destructive font-medium px-1">Discard?</span>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-6 px-2 text-[11px]"
                          onClick={(e) => {
                            e.stopPropagation();
                            discardDraft(draft.id);
                            setConfirmingDiscardId(null);
                          }}
                        >
                          Yes
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-1.5 text-[11px]"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmingDiscardId(null);
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs gap-1 font-medium bg-background hover:bg-accent"
                          onClick={() => resumeDraft(draft.id)}
                          aria-label={`Resume ${draft.title}`}
                        >
                          <Maximize2 className="h-3.5 w-3.5 text-primary" />
                          Resume
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmingDiscardId(draft.id);
                          }}
                          aria-label={`Discard ${draft.title}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Multi-item footer indicator when collapsed */}
        {!isExpanded && count > 1 && (
          <div
            onClick={() => setIsExpanded(true)}
            className="px-3 py-1.5 bg-muted/20 text-center text-[11px] font-medium text-muted-foreground hover:text-foreground cursor-pointer border-t border-border/40"
          >
            + {count - 1} more draft{count - 1 > 1 ? "s" : ""} (click to expand)
          </div>
        )}
      </div>
    </aside>
  );
}
