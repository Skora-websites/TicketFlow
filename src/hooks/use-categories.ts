"use client";

import { useEffect, useState } from "react";

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

/**
 * Fetches the dynamic category list (shared by client + agent ticket forms).
 * Falls back to the four seeded defaults while loading / on failure so forms
 * never render an empty dropdown.
 */
export function useCategories() {
  const [categories, setCategories] = useState<CategoryOption[]>(FALLBACK);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/categories")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.categories?.length) {
          setCategories(
            data.categories.map(
              (c: {
                _id: string;
                name: string;
                slug: string;
                color?: string;
                departmentId?: { _id: string; name: string; color?: string } | null;
              }) => ({
                _id: c._id,
                name: c.name,
                slug: c.slug,
                color: c.color,
                departmentId: c.departmentId ?? null,
              })
            )
          );
        }
      })
      .catch(() => {
        // keep fallback
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
