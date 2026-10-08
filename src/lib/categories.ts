// Pure helpers for the dynamic ticket-category system. Both client tickets and
// agent tickets share the same category list; the four defaults below are
// seeded and super admins can add more at runtime (see /dashboard/categories).

/** URL/API-safe slug for a category name ("R&D & Ops" -> "rand-and-ops"). */
export function slugifyCategory(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export const DEFAULT_CATEGORY_SEEDS: {
  name: string;
  slug: string;
  color: string;
  description: string;
}[] = [
  { name: "Marketing", slug: "marketing", color: "#EC4899", description: "Campaigns, content, brand and communications" },
  { name: "Development", slug: "development", color: "#4F46E5", description: "Engineering, bugs and product development" },
  { name: "Sales", slug: "sales", color: "#10B981", description: "Deals, CRM, invoicing and pipeline" },
  { name: "Other", slug: "other", color: "#6B7280", description: "Everything that fits nowhere else" },
];

// One-time migration map: pre-transfer tickets carried bug/feature/support.
// Applied by the seed script; old values never re-enter the system because the
// API validates categories against the Category collection.
export const LEGACY_CATEGORY_MAP: Record<string, string> = {
  bug: "development",
  feature: "development",
  support: "other",
};

export const LEGACY_CATEGORY_SLUGS = Object.keys(LEGACY_CATEGORY_MAP);
