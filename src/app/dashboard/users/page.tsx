import { Metadata } from "next";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { requireRole } from "@/lib/authz";
import { UsersContent } from "./UsersContent";

export const metadata: Metadata = {
  title: "Users - Dashboard",
  description: "Manage users and roles",
};

export default async function UsersPage() {
  await requireRole("super_admin", "manager");
  return (
    <DashboardLayout>
      <UsersContent />
    </DashboardLayout>
  );
}