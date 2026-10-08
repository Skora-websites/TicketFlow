import { Metadata } from "next";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { requireRole } from "@/lib/authz";
import { WorkloadContent } from "./WorkloadContent";

export const metadata: Metadata = {
  title: "Team Workload - Dashboard",
  description: "View team member workload and ticket distribution",
};

export default async function WorkloadPage() {
  await requireRole("super_admin", "manager");
  return (
    <DashboardLayout>
      <WorkloadContent />
    </DashboardLayout>
  );
}