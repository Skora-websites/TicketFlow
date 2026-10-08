import { Metadata } from "next";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { requireRole } from "@/lib/authz";
import { OverviewContent } from "./OverviewContent";

export const metadata: Metadata = {
  title: "Overview - Dashboard",
  description: "TicketFlow Dashboard Overview",
};

export default async function OverviewPage() {
  await requireRole("super_admin", "manager", "team");
  return (
    <DashboardLayout>
      <OverviewContent />
    </DashboardLayout>
  );
}