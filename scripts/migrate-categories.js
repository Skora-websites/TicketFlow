/**
 * One-off migration: refresh legacy category values ("bug"/"feature"/"support")
 * inside existing routing-rule conditions to the new dynamic categories.
 * Run from the project root: node scripts/migrate-categories.js
 */
const path = require("path");
const { MongoClient } = require(path.join(process.cwd(), "node_modules", "mongodb"));

(async () => {
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ticketing";
  const afterSlash = uri.split("/").pop() || "";
  const dbName = afterSlash && afterSlash.includes("?") ? afterSlash.split("?")[0] : afterSlash || "ticketing";
  const c = new MongoClient(uri);
  await c.connect();
  const db = c.db(dbName);

  const r = await db.collection("routingrules").updateMany(
    { "conditions.field": "category", "conditions.value": { $in: ["bug", "feature", "support"] } },
    [
      {
        $set: {
          conditions: {
            $map: {
              input: "$conditions",
              as: "cond",
              in: {
                $mergeObjects: [
                  "$$cond",
                  {
                    value: {
                      $switch: {
                        branches: [
                          { case: { $in: ["$$cond.value", ["bug", "feature"]] }, then: "development" },
                          { case: { $eq: ["$$cond.value", "support"] }, then: "other" },
                        ],
                        default: "$$cond.value",
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      },
    ]
  );
  console.log("routing rules updated:", r.modifiedCount);

  // Migrate any leftover ticket documents too (seed re-run covers these, but
  // keep it idempotent for production data).
  const t = await db.collection("tickets").updateMany(
    { category: { $in: ["bug", "feature"] } },
    { $set: { category: "development" } }
  );
  const t2 = await db.collection("tickets").updateMany(
    { category: "support" },
    { $set: { category: "other" } }
  );
  console.log("tickets migrated:", t.modifiedCount + t2.modifiedCount);

  await c.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
