// Restores db-dump/*.jsonl into the `ticketing` DB.
// Usage: node scripts/restore-db.js [uri]
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

function parseEjson(line) {
  return JSON.parse(line, (_k, v) => {
    if (v && typeof v === "object" && v.$oid) return new mongoose.Types.ObjectId(v.$oid);
    if (v && typeof v === "object" && v.$date) return new Date(v.$date);
    if (v && typeof v === "object" && v.$binary) return Buffer.from(v.$binary, "base64");
    return v;
  });
}

async function main() {
  const uri = process.env.MONGODB_URI || process.argv[2] || "mongodb://127.0.0.1:27017/ticketing";
  await mongoose.connect(uri, { dbName: "ticketing" });
  const db = mongoose.connection.db;
  const dir = path.join(__dirname, "..", "db-dump");
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl"))) {
    const name = file.replace(/\.jsonl$/, "");
    const lines = fs.readFileSync(path.join(dir, file), "utf8").split("\n").filter(Boolean);
    const docs = lines.map(parseEjson);
    if (docs.length) {
      await db.collection(name).deleteMany({});
      await db.collection(name).insertMany(docs);
    }
    console.log(`${name}: restored ${docs.length}`);
  }
  await mongoose.disconnect();
  console.log("Restore complete.");
}

main().catch((e) => { console.error(e); process.exit(1); });
