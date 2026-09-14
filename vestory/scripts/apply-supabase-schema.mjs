import fs from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const connectionString = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;
if (!connectionString) throw new Error("Missing POSTGRES_URL_NON_POOLING or POSTGRES_URL");

const migrationPath = path.join(process.cwd(), "supabase", "migrations", "202609140001_initial.sql");
const migration = await fs.readFile(migrationPath, "utf8");
const sql = postgres(connectionString, { max: 1, ssl: "require" });
try {
  await sql.begin((transaction) => transaction.unsafe(migration));
  console.log("Supabase schema is ready.");
} finally {
  await sql.end();
}
