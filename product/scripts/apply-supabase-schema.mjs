import fs from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const connectionString = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;
if (!connectionString) throw new Error("Missing POSTGRES_URL_NON_POOLING or POSTGRES_URL");

const migrationsDir = path.join(process.cwd(), "supabase", "migrations");
const files = (await fs.readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort();
if (!files.length) throw new Error(`No .sql migrations found in ${migrationsDir}`);

const sql = postgres(connectionString, { max: 1, ssl: "require" });
try {
  for (const file of files) {
    const migration = await fs.readFile(path.join(migrationsDir, file), "utf8");
    await sql.begin((transaction) => transaction.unsafe(migration));
    console.log(`Applied ${file}`);
  }
  console.log("Supabase schema is ready.");
} finally {
  await sql.end();
}
