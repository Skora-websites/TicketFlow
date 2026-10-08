import { Metadata } from "next";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { requireRole } from "@/lib/authz";
import { QueueContent } from "./QueueContent";

export const metadata: Metadata = {
  title: "Unassigned Queue - Dashboard",
  description: "View and assign unassigned tickets",
};

export default async function QueuePage() {
  await requireRole("super_admin", "manager");
  return (
    <DashboardLayout>
      <QueueContent />
    </DashboardLayout>
  );
}