"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

/**
 * Global keyboard layer (Linear-style).
 *
 * Two families of shortcuts:
 *  - Chords: `g` then a key (g+t tickets, g+o overview, g+u users …) — a
 *    Linear signature. The pending chord is held in a ref + tiny visual hint.
 *  - Single keys: `c` (new ticket), `/` (focus search), `?` (this cheat
 *    sheet), `g g` (top of page).
 *
 * Deliberately ignored while typing in inputs/textareas/contenteditable, and
 * while any modifier is held (so browser/OS combos like ⌘C, ⌘T still work).
 * The provider is mounted inside DashboardLayout so every dashboard page
 * inherits it; role decides which destinations are offered.
 */

type Chord = { key: string; label: string; href: string; roles?: string[] };

const CHORDS: Chord[] = [
  { key: "o", label: "Overview", href: "/dashboard/overview" },
  { key: "t", label: "Tickets", href: "/dashboard/tickets" },
  { key: "m", label: "My Tickets", href: "/dashboard/tickets?view=mine" },
  { key: "q", label: "Unassigned Queue", href: "/dashboard/queue", roles: ["super_admin", "manager"] },
  { key: "w", label: "Team Workload", href: "/dashboard/workload", roles: ["super_admin", "manager"] },
  { key: "a", label: "Analytics", href: "/dashboard/analytics", roles: ["super_admin", "manager"] },
  { key: "r", label: "Routing Rules", href: "/dashboard/routing", roles: ["super_admin", "manager"] },
  { key: "u", label: "Users", href: "/dashboard/users", roles: ["super_admin", "manager"] },
  { key: "d", label: "Departments", href: "/dashboard/departments", roles: ["super_admin"] },
  { key: "n", label: "Notifications", href: "/dashboard/notifications" },
];

const SINGLE_KEYS = [
  { keys: "c", label: "New ticket" },
  { keys: "/", label: "Search (command palette)" },
  { keys: "g then key", label: "Go to page (see below)" },
  { keys: "g g", label: "Scroll to top" },
  { keys: "?", label: "Shortcut cheat sheet" },
];

interface KeyboardLayerValue {
  /** Open the command palette (wired by the header's palette trigger). */
  focusSearch: () => void;
  /** Pages call this in an effect to expose their search input to `/`. */
  registerSearchFocus: (fn: () => void) => void;
}

const KeyboardLayerContext = createContext<KeyboardLayerValue>({
  focusSearch: () => {},
  registerSearchFocus: () => {},
});

export function useKeyboardLayer() {
  return useContext(KeyboardLayerContext);
}

export function KeyboardLayerProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: session } = useSession();
  const role = session?.user?.role as string | undefined;
  const [chordPending, setChordPending] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const searchRef = useRef<() => void>(() => {});
  const chordTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const focusSearch = useCallback(() => {
    searchRef.current();
  }, []);

  const registerSearchFocus = useCallback((fn: () => void) => {
    searchRef.current = fn;
  }, []);

  const isTypingTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (helpOpen) {
        // Only Escape (handled by Dialog) matters while the sheet is open.
        return;
      }

      // Pending g-chord: resolve or expire.
      if (chordPending) {
        e.preventDefault();
        setChordPending(false);
        if (chordTimer.current) clearTimeout(chordTimer.current);
        if (e.key === "g") {
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
        const chord = CHORDS.find((c) => c.key === e.key.toLowerCase() && (!c.roles || c.roles.includes(role ?? "")));
        if (chord) router.push(chord.href);
        return;
      }

      if (e.key === "g") {
        e.preventDefault();
        setChordPending(true);
        // Chord expires like Linear's — a stray `g` shouldn't linger forever.
        chordTimer.current = setTimeout(() => setChordPending(false), 1600);
        return;
      }

      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }

      if (e.key === "c") {
        e.preventDefault();
        router.push(role === "client" ? "/client/tickets/new" : "/dashboard/tickets/new");
        return;
      }

      if (e.key === "/") {
        e.preventDefault();
        searchRef.current();
        return;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (chordTimer.current) clearTimeout(chordTimer.current);
    };
  }, [chordPending, helpOpen, role, router]);

  const value = useMemo(() => ({ focusSearch, registerSearchFocus }), [focusSearch, registerSearchFocus]);

  const availableChords = CHORDS.filter((c) => !c.roles || c.roles.includes(role ?? ""));

  return (
    <KeyboardLayerContext.Provider value={value}>
      {children}

      {/* Tiny Linear-style hint while a g-chord is pending. */}
      {chordPending && (
        <div
          className="fixed bottom-4 left-4 z-50 rounded-lg border border-border bg-popover px-2.5 py-1.5 font-mono text-xs text-popover-foreground shadow-md"
          role="status"
          aria-live="polite"
        >
          g…
        </div>
      )}

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-lg" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Keyboard shortcuts</DialogTitle>
            <DialogDescription>
              Press <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">?</kbd>{" "}
              anywhere in the dashboard to reopen this.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <section aria-label="Single key shortcuts">
              <p className="mb-2 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
                Actions
              </p>
              <ul className="space-y-1.5">
                {SINGLE_KEYS.map((s) => (
                  <li key={s.keys} className="flex items-center justify-between gap-4 text-sm">
                    <span className="text-muted-foreground">{s.label}</span>
                    <kbd className="rounded border border-border bg-muted px-2 py-0.5 font-mono text-xs text-foreground">
                      {s.keys}
                    </kbd>
                  </li>
                ))}
              </ul>
            </section>
            <section aria-label="Go-to navigation chords">
              <p className="mb-2 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
                Go to
              </p>
              <ul className="space-y-1.5">
                {availableChords.map((c) => (
                  <li key={c.key} className="flex items-center justify-between gap-4 text-sm">
                    <span className="text-muted-foreground">{c.label}</span>
                    <kbd className="rounded border border-border bg-muted px-2 py-0.5 font-mono text-xs text-foreground">
                      g {c.key}
                    </kbd>
                  </li>
                ))}
              </ul>
            </section>
            <section aria-label="Ticket list navigation">
              <p className="mb-2 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
                Ticket list
              </p>
              <ul className="space-y-1.5 text-sm">
                <li className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Move down / up</span>
                  <kbd className="rounded border border-border bg-muted px-2 py-0.5 font-mono text-xs">j / k</kbd>
                </li>
                <li className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Open selected</span>
                  <kbd className="rounded border border-border bg-muted px-2 py-0.5 font-mono text-xs">Enter</kbd>
                </li>
                <li className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Clear selection</span>
                  <kbd className="rounded border border-border bg-muted px-2 py-0.5 font-mono text-xs">Esc</kbd>
                </li>
              </ul>
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </KeyboardLayerContext.Provider>
  );
}

