import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import { createClient } from "@supabase/supabase-js";
import { assertLocalServiceEnvironment } from "./lib/local-only.mjs";

assertLocalServiceEnvironment();

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secret) throw new Error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY");

const dataDir = process.env.VESTORY_DATA_DIR
  ? path.resolve(process.env.VESTORY_DATA_DIR)
  : path.join(process.cwd(), "data");
const sqlite = new Database(path.join(dataDir, "vestory.sqlite"), { readonly: true });
const supabase = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
const bucket = "vestory-audio";

function rows(table) {
  return sqlite.prepare(`select * from ${table}`).all();
}

function bool(value) {
  return Boolean(value);
}

async function upsert(table, values) {
  if (!values.length) return;
  const { error } = await supabase.from(table).upsert(values);
  if (error) throw new Error(`${table}: ${error.message}`);
}

try {
  await upsert("settings", rows("settings").map((row) => ({ ...row, onboarding_complete: bool(row.onboarding_complete) })));
  await upsert("onboarding_draft", rows("onboarding_draft").map((row) => ({
    ...row, assets_json: JSON.parse(row.assets_json),
  })));
  await upsert("assets", rows("assets"));
  await upsert("interests", rows("interests").map((row) => ({ ...row, custom: bool(row.custom) })));
  await upsert("briefs", rows("briefs").map((row) => ({ ...row, profile_snapshot: JSON.parse(row.profile_snapshot) })));

  const chapters = rows("chapters");
  await upsert("chapters", chapters.map((row) => ({
    ...row,
    audio_file: row.audio_file ? `${row.brief_id}/${row.audio_file}` : null,
  })));
  await upsert("sources", rows("sources"));

  let uploaded = 0;
  for (const brief of rows("briefs")) {
    const directory = path.join(dataDir, "audio", brief.id);
    let names = [];
    try { names = await fs.readdir(directory); } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    for (const name of names.filter((value) => value.endsWith(".mp3"))) {
      const bytes = await fs.readFile(path.join(directory, name));
      const { error } = await supabase.storage.from(bucket).upload(`${brief.id}/${name}`, bytes, {
        contentType: "audio/mpeg", upsert: true,
      });
      if (error) throw new Error(`audio ${brief.id}/${name}: ${error.message}`);
      uploaded += 1;
    }
  }

  const expected = Object.fromEntries(["settings", "onboarding_draft", "assets", "interests", "briefs", "chapters", "sources"]
    .map((table) => [table, rows(table).length]));
  const actual = {};
  for (const table of Object.keys(expected)) {
    const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
    if (error) throw new Error(`verify ${table}: ${error.message}`);
    actual[table] = count ?? 0;
    if (actual[table] < expected[table]) throw new Error(`verify ${table}: expected at least ${expected[table]}, found ${actual[table]}`);
  }
  console.log(JSON.stringify({ databaseRows: actual, audioFilesUploaded: uploaded }, null, 2));
} finally {
  sqlite.close();
}
