import fs from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const connectionString = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;
if (!connectionString) throw new Error("Missing POSTGRES_URL_NON_POOLING or POSTGRES_URL");

const migrationDirectory = path.join(process.cwd(), "supabase", "migrations");
const migrationNames = (await fs.readdir(migrationDirectory))
  .filter((name) => name.endsWith(".sql"))
  .sort();
const sql = postgres(connectionString, { max: 1, ssl: "require" });
try {
  for (const name of migrationNames) {
    const migration = await fs.readFile(path.join(migrationDirectory, name), "utf8");
    await sql.begin((transaction) => transaction.unsafe(migration));
    console.log(`Applied ${name}`);
  }
  console.log("Supabase schema is ready.");
} finally {
  await sql.end();
}
