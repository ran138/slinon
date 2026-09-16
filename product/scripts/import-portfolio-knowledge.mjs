import { createClient } from "@supabase/supabase-js";
import { refreshPortfolioKnowledge } from "../lib/knowledge.mjs";
import { assertLocalServiceEnvironment } from "./lib/local-only.mjs";

assertLocalServiceEnvironment();

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secret) throw new Error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY");
if (!process.env.OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");

const supabase = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
const assets = [
  { kind: "holding", name: "Invesco QQQ Trust", symbol: "QQQ", assetClass: "ETF", exchange: "NASDAQ" },
  { kind: "holding", name: "NVIDIA", symbol: "NVDA", assetClass: "Equity", exchange: "NASDAQ" },
  { kind: "holding", name: "SPDR S&P 500 ETF Trust", symbol: "SPY", assetClass: "ETF", exchange: "NYSE Arca" },
  { kind: "holding", name: "Alpha Tau Medical", symbol: "DRTS", assetClass: "Equity", exchange: "NASDAQ" },
  { kind: "holding", name: "SoFi Technologies", symbol: "SOFI", assetClass: "Equity", exchange: "NASDAQ" },
  { kind: "holding", name: "IREN Limited", symbol: "IREN", assetClass: "Equity", exchange: "NASDAQ" },
  { kind: "holding", name: "iShares Semiconductor ETF", symbol: "SOXX", assetClass: "ETF", exchange: "NASDAQ" },
  { kind: "holding", name: "Alphabet", symbol: "GOOGL", assetClass: "Equity", exchange: "NASDAQ" },
  { kind: "holding", name: "Direxion Daily S&P 500 Bull 3X Shares", symbol: "SPXL", assetClass: "Leveraged ETF", exchange: "NYSE Arca" },
  { kind: "holding", name: "ProShares UltraPro QQQ", symbol: "TQQQ", assetClass: "Leveraged ETF", exchange: "NASDAQ" },
];

const currentInterests = await supabase.from("interests").select("label,custom");
if (currentInterests.error) throw new Error(`load interests: ${currentInterests.error.message}`);
const interests = new Map((currentInterests.data ?? []).map((item) => [item.label, item]));
for (const label of ["השקעות", "פוליטיקה ורגולציה", "דוחות כספיים"]) {
  interests.set(label, { label, custom: true });
}

const profile = await supabase.rpc("replace_profile", {
  p_assets: assets.map((asset) => ({ id: crypto.randomUUID(), ...asset, asset_class: asset.assetClass })),
  p_interests: [...interests.values()].map((interest) => ({ id: crypto.randomUUID(), ...interest })),
  p_target_minutes: 7,
  p_onboarding_complete: true,
});
if (profile.error) throw new Error(`save portfolio: ${profile.error.message}`);

const result = await refreshPortfolioKnowledge({
  supabase,
  assets,
  openaiApiKey: process.env.OPENAI_API_KEY,
  textModel: process.env.OPENAI_TEXT_MODEL ?? "gpt-5.6-terra",
  embeddingModel: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-large",
});

console.log(JSON.stringify({
  portfolioSymbols: assets.map((asset) => asset.symbol),
  ...result,
}, null, 2));
