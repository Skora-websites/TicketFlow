"use client";

import { useEffect, useState } from "react";
import { fetchWithCache, getCached } from "@/lib/client-cache";

export interface CategoryOption {
  _id: string;
  name: string;
  slug: string;
  color?: string;
  /** Department owning this category (populates tickets may only be
   *  transferred to it). Null/unset when the super admin hasn't linked one. */
  departmentId?: { _id: string; name: string; color?: string } | null;
}

const FALLBACK: CategoryOption[] = [
  { _id: "marketing", name: "Marketing", slug: "marketing", color: "#EC4899" },
  { _id: "development", name: "Development", slug: "development", color: "#4F46E5" },
  { _id: "sales", name: "Sales", slug: "sales", color: "#10B981" },
  { _id: "other", name: "Other", slug: "other", color: "#6B7280" },
];

const CATEGORIES_URL = "/api/categories";

/**
 * Fetches the dynamic category list (shared by client + agent ticket forms).
 * Uses in-memory cache so forms render categories immediately without delay,
 * falling back to the four seeded defaults while loading / on failure.
 */
export function useCategories() {
  const cached = getCached<{ categories?: CategoryOption[] }>(CATEGORIES_URL);
  const initialData = cached?.categories?.length ? cached.categories : FALLBACK;
  const [categories, setCategories] = useState<CategoryOption[]>(initialData);
  const [isLoading, setIsLoading] = useState(!cached?.categories?.length);

  useEffect(() => {
    let cancelled = false;
    fetchWithCache<{
      categories: {
        _id: string;
        name: string;
        slug: string;
        color?: string;
        departmentId?: { _id: string; name: string; color?: string } | null;
      }[];
    }>(CATEGORIES_URL, undefined, { ttlMs: 60_000 })
      .then((data) => {
        if (!cancelled && data?.categories?.length) {
          const mapped = data.categories.map((c) => ({
            _id: c._id,
            name: c.name,
            slug: c.slug,
            color: c.color,
            departmentId: c.departmentId ?? null,
          }));
          setCategories(mapped);
        }
      })
      .catch(() => {
        // keep existing/fallback
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { categories, isLoading };
}
