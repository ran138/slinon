import { describe, expect, it } from "vitest";
import {
  assertLocalServiceEnvironment,
  assertLocalUrl,
} from "../scripts/lib/local-only.mjs";

describe("local-only service guard", () => {
  it.each([
    "http://127.0.0.1:54321",
    "http://localhost:54321",
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    "postgresql://postgres:postgres@[::1]:54322/postgres",
  ])("accepts a loopback endpoint: %s", (value) => {
    expect(() => assertLocalUrl("TEST_URL", value)).not.toThrow();
  });

  it.each([
    "https://example.supabase.co",
    "postgresql://postgres:secret@db.example.com:5432/postgres",
    "https://127.0.0.1.attacker.example",
  ])("rejects a remote endpoint: %s", (value) => {
    expect(() => assertLocalUrl("TEST_URL", value)).toThrow(/Refusing non-local/);
  });

  it("checks every configured service URL, not only the database", () => {
    expect(() => assertLocalServiceEnvironment({
      SUPABASE_URL: "https://example.supabase.co",
      POSTGRES_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    })).toThrow(/SUPABASE_URL/);
  });

  it("fails closed when no service endpoints are configured", () => {
    expect(() => assertLocalServiceEnvironment({})).toThrow(/No local service URLs/);
  });
});
