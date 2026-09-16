import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProviderFailureCode, ProviderName } from "./types";

export interface QuotaReservation {
  reserved: boolean;
  usedCredits: number;
  monthlyLimit: number;
  unavailableUntil: string | null;
}

export interface ProviderQuotaStore {
  reserve(provider: ProviderName, credits?: number): Promise<QuotaReservation>;
  recordFailure(
    provider: ProviderName,
    failureCode: ProviderFailureCode,
    unavailableUntil?: string | null,
  ): Promise<void>;
}

interface ReservationRow {
  reserved: boolean;
  used_credits: number;
  monthly_limit: number;
  unavailable_until: string | null;
}

export class SupabaseProviderQuotaStore implements ProviderQuotaStore {
  constructor(private readonly supabase: SupabaseClient) {}

  async reserve(provider: ProviderName, credits = 1): Promise<QuotaReservation> {
    const { data, error } = await this.supabase.rpc("reserve_ingestion_provider_credits", {
      p_provider: provider,
      p_credits: credits,
    });
    if (error) throw new Error(`reserve provider credits: ${error.message}`);
    const row = (data as ReservationRow[] | null)?.[0];
    if (!row) throw new Error("reserve provider credits returned no result");
    return {
      reserved: row.reserved,
      usedCredits: row.used_credits,
      monthlyLimit: row.monthly_limit,
      unavailableUntil: row.unavailable_until,
    };
  }

  async recordFailure(
    provider: ProviderName,
    failureCode: ProviderFailureCode,
    unavailableUntil: string | null = null,
  ): Promise<void> {
    const { error } = await this.supabase.rpc("record_ingestion_provider_failure", {
      p_provider: provider,
      p_failure_code: failureCode,
      p_unavailable_until: unavailableUntil,
    });
    if (error) throw new Error(`record provider failure: ${error.message}`);
  }
}
