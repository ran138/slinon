import assert from "node:assert/strict";
import { matchAsset, matchInterest, normalizeInterests, parseOnboardingText, searchAssets, searchInterests } from "../lib/onboarding.ts";

for (const input of ["NVIDIA", "Nvidia", "NVDA"]) assert.equal(parseOnboardingText(input).assets[0]?.symbol, "NVDA", input);
for (const input of ["S&P 500", "S&P500", "s&p 500", "S & P 500"]) assert.equal(parseOnboardingText(input).assets[0]?.symbol, "SPY", input);
for (const [input, expected] of [["AI", "AI"], ["זהב", "זהב"], ["נדל״ן", "שוק הנדל״ן"], ['נדל"ן', "שוק הנדל״ן"], ["real estate", "שוק הנדל״ן"], ["טכנולוגיה", "טכנולוגיה"], ["biotech", "ביוטק ופארמה"], ["interest rates", "ריבית ואינפלציה"]]) {
  assert.deepEqual(parseOnboardingText(input).interests, [expected], input);
}
const mixed = parseOnboardingText("NVIDIA, S&P500, AI, זהב, נדל״ן, רובוטיקה");
assert.deepEqual(mixed.assets.map((asset) => asset.symbol), ["NVDA", "SPY"]);
assert.deepEqual(mixed.interests, ["AI", "זהב", "שוק הנדל״ן", "רובוטיקה"]);
assert.equal(searchAssets("S & P500")[0]?.ticker, "SPY");
assert.equal(searchAssets("Nvidai")[0]?.ticker, "NVDA");
assert.equal(matchAsset("Nvidi")?.ticker, "NVDA");
assert.equal(matchInterest("technolgy"), "טכנולוגיה");
assert.equal(searchInterests("realestate")[0]?.id, "שוק הנדל״ן");
assert.equal(searchInterests("biotceh")[0]?.id, "ביוטק ופארמה");
assert.equal(matchAsset("MET"), undefined); // No short ticker guessing.
assert.equal(matchInterest("A"), undefined);
assert.deepEqual(parseOnboardingText("MET, A, quantum robotics").interests, ["MET", "A", "quantum robotics"]);
assert.equal(parseOnboardingText("NVIDIA, NVDA, S&P500, S & P 500").assets.length, 2);
assert.deepEqual(normalizeInterests(["AI", "ai", "real estate", 'נדל"ן']), ["AI", "שוק הנדל״ן"]);
assert.deepEqual(parseOnboardingText("sustainable investing").interests, ["sustainable investing"]); // 'AI' substring must not match.
assert.deepEqual(parseOnboardingText("NVIDIA AI רובוטיקה").interests, ["AI", "רובוטיקה"]);
console.log("Onboarding matching: all exact/alias/format/topic/mixed/typo/custom/deduplication tests passed.");
