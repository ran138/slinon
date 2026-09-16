import { spawnSync } from "node:child_process";
import process from "node:process";
import { assertLocalServiceEnvironment } from "./lib/local-only.mjs";

assertLocalServiceEnvironment();

// Migrations are not safe to replay on an already migrated database. The CLI
// checks its local ledger and applies pending files only.
const result = spawnSync("supabase", ["migration", "up", "--local"], {
  cwd: process.cwd(),
  encoding: "utf8",
  stdio: "inherit",
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log("Supabase schema is ready.");
