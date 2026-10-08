import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { previewRouting } from "@/lib/routing/engine";
import { getUser } from "@/lib/authz";

const previewSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().min(1).max(10000),
  // Dynamic categories: any slug is accepted; rule matching just compares
  // strings, and unknown values simply never match a category condition.
  category: z.string().min(1).max(40).regex(/^[a-z0-9-]+$/),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  requesterId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Routing configuration is internal: clients must not be able to probe
    // rule names, targeting, or assignee/department ids via preview.
    if (user.role === "client") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = previewSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    // A non-super_admin may only preview routing for themselves — supplying
    // another requesterId would leak how other users' tickets get routed.
    const requesterId =
      user.role === "super_admin" && parsed.data.requesterId
        ? parsed.data.requesterId
        : user.id;

    // Pass the raw title/description — real routing (POST /api/tickets) runs
    // keyword matching on unsanitized text, so the preview must too. sanitizeSearch
    // here escaped regex metacharacters, making preview and reality diverge for
    // keyword rules containing e.g. "C++" or "50%". The engine does plain
    // substring matching (no regex, no injection risk); the zod schema bounds
    // input length and requesterId is pinned to the caller above.
    const decision = await previewRouting({
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category,
      priority: parsed.data.priority,
      requesterId,
    });

    return NextResponse.json({ decision });
  } catch (error) {
    console.error("POST /api/routing/preview error:", error);
    return NextResponse.json({ error: "Failed to preview routing" }, { status: 500 });
  }
}
