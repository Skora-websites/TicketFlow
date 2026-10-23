import { MongoMemoryServer } from "mongodb-memory-server";

async function start() {
  console.log("Starting local MongoDB on port 27017...");
  const mongod = await MongoMemoryServer.create({
    instance: {
      port: 27017,
      dbName: "ticketing",
    },
  });
  console.log("MongoDB ready at:", mongod.getUri());
}

start().catch((err) => {
  console.error("Failed to start MongoDB:", err);
  process.exit(1);
});
