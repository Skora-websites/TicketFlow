import { Metadata } from "next";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { requireRole } from "@/lib/authz";
import { AnalyticsContent } from "./AnalyticsContent";

export const metadata: Metadata = {
  title: "Analytics - Dashboard",
  description: "View detailed analytics and reports",
};

export default async function AnalyticsPage() {
  await requireRole("super_admin", "manager");
  return (
    <DashboardLayout>
      <AnalyticsContent />
    </DashboardLayout>
  );
}