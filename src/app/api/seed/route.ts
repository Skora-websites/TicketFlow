import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongo";
import { User } from "@/lib/db/models";
import { seed } from "@/lib/db/seed";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await connectDB();
    const count = await User.countDocuments();
    const { searchParams } = new URL(req.url);
    const secret = searchParams.get("secret");
    const expectedSecret =
      process.env.AUTH_SECRET ||
      "ticketflow-session-secret-key-32chars-min-prod-fallback";

    if (count > 0 && secret !== expectedSecret) {
      return NextResponse.json({
        ok: true,
        message: `Database already seeded (${count} users present). To re-seed, provide ?secret=AUTH_SECRET.`,
        userCount: count,
      });
    }

    await seed();
    const newCount = await User.countDocuments();
    return NextResponse.json({
      ok: true,
      message: "Database seeded successfully with demo users, departments, and routing rules.",
      userCount: newCount,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
