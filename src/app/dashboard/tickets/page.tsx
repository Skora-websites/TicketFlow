import { Metadata } from "next";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { requireRole } from "@/lib/authz";
import { TicketsContent } from "./TicketsContent";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tickets - Dashboard",
  description: "View and manage all tickets",
};

export default async function TicketsPage() {
  await requireRole("super_admin", "manager", "team");
  return (
    <DashboardLayout>
      <TicketsContent />
    </DashboardLayout>
  );
}