import { BaseDraft } from "./types";

const STORAGE_PREFIX = "ticketflow:draft:";
const MAX_DRAFT_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days TTL

/**
 * Safe local storage accessor that handles SSR, storage quotas, and private browsing exceptions.
 */
function isStorageAvailable(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const testKey = "__tf_storage_test__";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

export function saveDraftToStorage<T>(draft: BaseDraft<T>): boolean {
  if (!isStorageAvailable()) return false;
  try {
    const key = `${STORAGE_PREFIX}${draft.id}`;
    window.localStorage.setItem(key, JSON.stringify(draft));
    return true;
  } catch (err) {
    console.warn("Failed to persist draft to localStorage:", err);
    return false;
  }
}

export function loadDraftFromStorage<T>(id: string): BaseDraft<T> | null {
  if (!isStorageAvailable()) return null;
  try {
    const key = `${STORAGE_PREFIX}${id}`;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BaseDraft<T>;
    // Discard expired drafts
    if (Date.now() - parsed.updatedAt > MAX_DRAFT_AGE_MS) {
      removeDraftFromStorage(id);
      return null;
    }
    return parsed;
  } catch {
    removeDraftFromStorage(id);
    return null;
  }
}

export function removeDraftFromStorage(id: string): void {
  if (!isStorageAvailable()) return;
  try {
    const key = `${STORAGE_PREFIX}${id}`;
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function loadAllDraftsFromStorage(): BaseDraft[] {
  if (!isStorageAvailable()) return [];
  const results: BaseDraft[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith(STORAGE_PREFIX)) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as BaseDraft;
        if (Date.now() - parsed.updatedAt <= MAX_DRAFT_AGE_MS) {
          results.push(parsed);
        } else {
          window.localStorage.removeItem(key);
        }
      } catch {
        window.localStorage.removeItem(key);
      }
    }
    results.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (err) {
    console.warn("Failed to load drafts from storage:", err);
  }
  return results;
}
