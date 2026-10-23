import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/authz";
import { getSecurityAndCostStatus } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET() {
  const authResult = await requireApiRole("super_admin");
  if (authResult instanceof NextResponse) return authResult;

  try {
    const status = await getSecurityAndCostStatus();
    return NextResponse.json(status);
  } catch (error) {
    console.error("GET /api/stats/quotas error:", error);
    return NextResponse.json({ error: "Failed to retrieve quota status" }, { status: 500 });
  }
}
