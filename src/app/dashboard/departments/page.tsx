import { Metadata } from "next";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { requireRole } from "@/lib/authz";
import { DepartmentsContent } from "./DepartmentsContent";

export const metadata: Metadata = {
  title: "Departments - Dashboard",
  description: "Manage departments and their settings",
};

export default async function DepartmentsPage() {
  await requireRole("super_admin", "manager");
  return (
    <DashboardLayout>
      <DepartmentsContent />
    </DashboardLayout>
  );
}