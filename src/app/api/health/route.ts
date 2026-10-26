import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/mongo";
import { User } from "@/lib/db/models";

export const dynamic = "force-dynamic";

export async function GET() {
  const envCheck = {
    hasMongoUri: !!process.env.MONGODB_URI,
    isLocalhostMongo:
      !process.env.MONGODB_URI ||
      process.env.MONGODB_URI.includes("127.0.0.1") ||
      process.env.MONGODB_URI.includes("localhost"),
    hasAuthSecret: !!process.env.AUTH_SECRET,
    hasAuthTrustHost: !!process.env.AUTH_TRUST_HOST,
    nodeEnv: process.env.NODE_ENV,
  };

  let dbStatus = "disconnected";
  let userCount = 0;
  let dbError: string | null = null;

  try {
    await connectDB();
    dbStatus = mongoose.connection.readyState === 1 ? "connected" : "connecting";
    userCount = await User.countDocuments();
  } catch (err: unknown) {
    dbStatus = "error";
    dbError = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json({
    status: dbStatus === "connected" && userCount > 0 ? "healthy" : "warning",
    environment: envCheck,
    database: {
      status: dbStatus,
      userCount,
      error: dbError,
    },
    recommendations: [
      ...(envCheck.isLocalhostMongo
        ? ["MONGODB_URI is pointing to localhost or unset. Set MONGODB_URI in Vercel to a MongoDB Atlas connection string."]
        : []),
      ...(userCount === 0 && dbStatus === "connected"
        ? ["Database is connected but has 0 users. Triggering any demo login will auto-seed the database."]
        : []),
      ...(!envCheck.hasAuthSecret
        ? ["AUTH_SECRET is not set in Vercel environment variables. Using fallback secret."]
        : []),
    ],
    timestamp: new Date().toISOString(),
  });
}
