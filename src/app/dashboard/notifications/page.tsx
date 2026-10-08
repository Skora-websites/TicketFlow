import { Metadata } from "next";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { requireRole } from "@/lib/authz";
import { NotificationsContent } from "./NotificationsContent";

export const metadata: Metadata = {
  title: "Notifications - Dashboard",
  description: "View and manage all your notifications",
};

export default async function NotificationsPage() {
  await requireRole("super_admin", "manager", "team");
  return (
    <DashboardLayout>
      <NotificationsContent />
    </DashboardLayout>
  );
}
