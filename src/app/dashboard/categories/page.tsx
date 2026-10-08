import { Metadata } from "next";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { requireRole } from "@/lib/authz";
import { CategoriesContent } from "./CategoriesContent";

export const metadata: Metadata = {
  title: "Categories - Dashboard",
  description: "Manage ticket categories (Marketing, Development, Sales, Other + custom)",
};

export default async function CategoriesPage() {
  await requireRole("super_admin");
  return (
    <DashboardLayout>
      <CategoriesContent />
    </DashboardLayout>
  );
}
