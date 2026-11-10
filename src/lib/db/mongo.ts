import mongoose from "mongoose";
import { getMongoUri } from "@/lib/env";

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: MongooseCache | undefined;
}

let cached: MongooseCache = global.mongooseCache || { conn: null, promise: null };
if (!global.mongooseCache) {
  global.mongooseCache = cached;
}

export async function connectDB(): Promise<typeof mongoose> {
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  if (!cached.promise) {
    // No fallback URI: a checked-in credential would hand the database to
    // anyone with repository access. getMongoUri() throws when unset.
    const uri = getMongoUri();
    cached.promise = mongoose
      .connect(uri, {
        maxPoolSize: 5,
        minPoolSize: 0,
        maxIdleTimeMS: 10000,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 20000,
        connectTimeoutMS: 10000,
        bufferCommands: false,
      })
      .then((m) => {
        console.log("MongoDB connected");
        return m;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export async function disconnectDB(): Promise<void> {
  if (cached.conn) {
    await mongoose.disconnect();
    cached.conn = null;
    cached.promise = null;
  }
}
