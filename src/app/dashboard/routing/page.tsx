import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { requireRole } from "@/lib/authz";
import { RoutingDashboardContent } from "@/components/routing/RoutingDashboardContent";

export const dynamic = "force-dynamic";

export default async function RoutingPage() {
  await requireRole("super_admin", "manager");
  return (
    <DashboardLayout>
      <RoutingDashboardContent />
    </DashboardLayout>
  );
}
