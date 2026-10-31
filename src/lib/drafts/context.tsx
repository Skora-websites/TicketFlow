"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { BaseDraft } from "./types";
import {
  saveDraftToStorage,
  loadDraftFromStorage,
  removeDraftFromStorage,
  loadAllDraftsFromStorage,
} from "./storage";

interface DraftResumeContextValue {
  drafts: BaseDraft<any>[];
  minimizedDrafts: BaseDraft<any>[];
  saveDraft: <T = any>(draft: Omit<BaseDraft<T>, "updatedAt">) => void;
  minimizeDraft: (id: string) => void;
  resumeDraft: (id: string) => void;
  discardDraft: (id: string) => void;
  getDraft: <T = any>(id: string) => BaseDraft<T> | undefined;
  activeResumeId: string | null;
  clearActiveResume: () => void;
}

const DraftResumeContext = createContext<DraftResumeContextValue | null>(null);

export function DraftResumeProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [drafts, setDrafts] = useState<BaseDraft<any>[]>([]);
  const [activeResumeId, setActiveResumeId] = useState<string | null>(null);

  // Initialize drafts from localStorage on mount
  useEffect(() => {
    const loaded = loadAllDraftsFromStorage();
    setDrafts(loaded);
  }, []);

  const saveDraft = useCallback(<T = any>(draftInput: Omit<BaseDraft<T>, "updatedAt">) => {
    const updatedDraft: BaseDraft<T> = {
      ...draftInput,
      updatedAt: Date.now(),
    };

    saveDraftToStorage(updatedDraft);

    setDrafts((prev) => {
      const idx = prev.findIndex((d) => d.id === updatedDraft.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updatedDraft as BaseDraft<any>;
        return next;
      }
      return [updatedDraft as BaseDraft<any>, ...prev];
    });
  }, []);

  const minimizeDraft = useCallback((id: string) => {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.id === id) {
          const updated = { ...d, isMinimized: true, updatedAt: Date.now() };
          saveDraftToStorage(updated);
          return updated;
        }
        return d;
      })
    );
  }, []);

  const resumeDraft = useCallback((id: string) => {
    const target = drafts.find((d) => d.id === id) || loadDraftFromStorage(id);
    if (!target) return;

    // Un-minimize draft
    const unminimized = { ...target, isMinimized: false, updatedAt: Date.now() };
    saveDraftToStorage(unminimized);

    setDrafts((prev) =>
      prev.map((d) => (d.id === id ? unminimized : d))
    );

    setActiveResumeId(id);

    // If current path doesn't match the draft's path, navigate there
    if (target.path && pathname !== target.path) {
      router.push(target.path);
    }
  }, [drafts, pathname, router]);

  const discardDraft = useCallback((id: string) => {
    removeDraftFromStorage(id);
    setDrafts((prev) => prev.filter((d) => d.id !== id));
    if (activeResumeId === id) {
      setActiveResumeId(null);
    }
  }, [activeResumeId]);

  const getDraft = useCallback(<T = Record<string, any>>(id: string): BaseDraft<T> | undefined => {
    const inMemory = drafts.find((d) => d.id === id);
    if (inMemory) return inMemory as BaseDraft<T>;
    const inStorage = loadDraftFromStorage<T>(id);
    return inStorage || undefined;
  }, [drafts]);

  const clearActiveResume = useCallback(() => {
    setActiveResumeId(null);
  }, []);

  const minimizedDrafts = useMemo(
    () => drafts.filter((d) => d.isMinimized),
    [drafts]
  );

  const value = useMemo(
    () => ({
      drafts,
      minimizedDrafts,
      saveDraft,
      minimizeDraft,
      resumeDraft,
      discardDraft,
      getDraft,
      activeResumeId,
      clearActiveResume,
    }),
    [drafts, minimizedDrafts, saveDraft, minimizeDraft, resumeDraft, discardDraft, getDraft, activeResumeId, clearActiveResume]
  );

  return (
    <DraftResumeContext.Provider value={value}>
      {children}
    </DraftResumeContext.Provider>
  );
}

export function useDraftResume() {
  const context = useContext(DraftResumeContext);
  if (!context) {
    throw new Error("useDraftResume must be used within a DraftResumeProvider");
  }
  return context;
}
