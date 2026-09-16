import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SupabaseProviderQuotaStore } from "../lib/ingestion/providers/quota";

const hasLocalEnvironment = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const integration = describe.runIf(hasLocalEnvironment);

integration("provider quota reservation", () => {
  const supabase = createClient(
    process.env.SUPABASE_URL ?? "http://127.0.0.1:54321",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "integration-test-not-configured",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const quota = new SupabaseProviderQuotaStore(supabase);

  beforeEach(async () => {
    await supabase.from("ingestion_provider_state").update({
      state: "active",
      unavailable_until: null,
      last_failure_code: null,
    }).eq("provider", "scraperapi");
    await supabase.from("ingestion_provider_usage").delete().eq("provider", "scraperapi");
    const { error } = await supabase.from("ingestion_provider_config")
      .update({ enabled: true, monthly_limit: 2 })
      .eq("provider", "scraperapi");
    if (error) throw error;
  });

  afterEach(async () => {
    await supabase.from("ingestion_provider_usage").delete().eq("provider", "scraperapi");
    await supabase.from("ingestion_provider_config")
      .update({ enabled: true, monthly_limit: 1000 })
      .eq("provider", "scraperapi");
    await supabase.from("ingestion_provider_state").update({
      state: "active",
      unavailable_until: null,
      last_failure_code: null,
    }).eq("provider", "scraperapi");
  });

  it("never grants more concurrent reservations than the monthly limit", async () => {
    const reservations = await Promise.all(Array.from({ length: 8 }, () => quota.reserve("scraperapi")));
    expect(reservations.filter((result) => result.reserved)).toHaveLength(2);
    expect(reservations.filter((result) => !result.reserved)).toHaveLength(6);

    const { data, error } = await supabase.from("ingestion_provider_usage")
      .select("used_credits")
      .eq("provider", "scraperapi")
      .single();
    if (error) throw error;
    expect(data.used_credits).toBe(2);

    const { data: state, error: stateError } = await supabase.from("ingestion_provider_state")
      .select("state,unavailable_until")
      .eq("provider", "scraperapi")
      .single();
    if (stateError) throw stateError;
    expect(state.state).toBe("monthly_quota_exhausted");
    expect(state.unavailable_until).not.toBeNull();
  });
});
