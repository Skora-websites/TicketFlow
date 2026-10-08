// One-shot: dumps every collection in the `ticketing` DB to db-dump/*.json
// (BSON-friendly: EJSON relaxed mode keeps ObjectId/Date readable).
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

async function main() {
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ticketing";
  await mongoose.connect(uri, { dbName: "ticketing" });
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  const outDir = path.join(__dirname, "..", "db-dump");
  fs.mkdirSync(outDir, { recursive: true });
  let total = 0;
  for (const { name } of collections) {
    if (name.startsWith("system.")) continue;
    const docs = await db.collection(name).find({}).toArray();
    const payload = docs.map((d) => JSON.stringify(d, (_k, v) => {
      if (v && typeof v === "object" && v._bsontype === "ObjectId") return { $oid: v.toString() };
      if (v instanceof Date) return { $date: v.toISOString() };
      if (v && typeof v === "object" && v._bsontype === "Binary") return { $binary: Buffer.from(v.buffer).toString("base64") };
      return v;
    })).join("\n");
    fs.writeFileSync(path.join(outDir, `${name}.jsonl`), payload);
    console.log(`${name}: ${docs.length} docs`);
    total += docs.length;
  }
  console.log(`TOTAL: ${total} docs in ${collections.length} collections`);
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
