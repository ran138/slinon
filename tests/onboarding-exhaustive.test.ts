import { describe, expect, it } from "vitest";
import {
  conceptKey,
  editDistance,
  matchAsset,
  matchInterest,
  normalizeInterests,
  parseOnboardingText,
  searchAssets,
  searchInterests,
} from "../product/lib/onboarding";

describe("asset recognition across supported markets", () => {
  it.each([
    ["Apple", "AAPL"], ["אפל", "AAPL"], ["Microsoft", "MSFT"], ["מיקרוסופט", "MSFT"],
    ["Tesla", "TSLA"], ["טסלה", "TSLA"], ["Amazon", "AMZN"], ["אמזון", "AMZN"],
    ["Netflix", "NFLX"], ["נטפליקס", "NFLX"], ["Google", "GOOGL"], ["אלפבית", "GOOGL"],
    ["Bitcoin", "BTC"], ["ביטקוין", "BTC"], ["Ethereum", "ETH"], ["אתריום", "ETH"],
    ["S&P 500", "SPY"], ["Nasdaq 100", "QQQ"], ["1122127", "TASE:NICE"], ["1084761", "TASE:CHKP"],
  ])("maps %s to %s", (query, ticker) => {
    expect(matchAsset(query)?.ticker).toBe(ticker);
  });

  it.each(["AAPL", "TSLA", "BTC", "SPY", "TASE:TEVA"])("keeps exact ticker %s stable", (ticker) => {
    expect(matchAsset(ticker)?.ticker).toBe(ticker);
  });

  it.each(["APL", "BT", "METAQ", "unknown-company", "123456"])("does not invent an asset for %s", (query) => {
    expect(matchAsset(query)).toBeUndefined();
  });
});

describe("interest recognition and normalization", () => {
  it.each([
    ["technology", "טכנולוגיה"], ["artificial intelligence", "AI"], ["crypto", "קריפטו"],
    ["inflation", "ריבית ואינפלציה"], ["israel economy", "כלכלת ישראל"],
    ["global economy", "כלכלה עולמית"], ["real estate", "שוק הנדל״ן"],
    ["energy", "אנרגיה"], ["forex", 'מט"ח'], ["bonds", 'אג"ח'],
    ["biotechnology", "ביוטק ופארמה"], ["semiconductors", "שבבים"], ["gold", "זהב"],
  ])("maps interest alias %s", (query, expected) => {
    expect(matchInterest(query)).toBe(expected);
  });

  it.each([
    [["AI", "בינה מלאכותית"], ["AI"]],
    [["energy", "אנרגיה"], ["אנרגיה"]],
    [["  נושא אישי  ", "נושא אישי"], ["נושא אישי"]],
    [["forex", 'מט"ח'], ['מט"ח']],
    [["gold", "זהב", "GOLD"], ["זהב"]],
  ])("deduplicates equivalent interest values", (input, expected) => {
    expect(normalizeInterests(input)).toEqual(expected);
  });
});

describe("search behavior", () => {
  it.each([
    ["app", "AAPL"], ["micro", "MSFT"], ["טס", "TSLA"], ["bit", "BTC"], ["1120", "TASE:TEVA"],
  ])("finds asset %s", (query, ticker) => {
    expect(searchAssets(query).map((asset) => asset.ticker)).toContain(ticker);
  });

  it.each([
    ["tech", "טכנולוגיה"], ["crypto", "קריפטו"], ["נדלן", "שוק הנדל״ן"], ["bio", "ביוטק ופארמה"], ["semi", "שבבים"],
  ])("finds interest %s", (query, interest) => {
    expect(searchInterests(query).map((item) => item.id)).toContain(interest);
  });

  it.each(["", "   ", "???", "לאקיים"])("returns no asset results for %j", (query) => {
    expect(searchAssets(query)).toEqual([]);
  });
});

describe("free-text onboarding parsing", () => {
  it.each([
    ["NVDA,AAPL", ["NVDA", "AAPL"]],
    ["NVDA;AAPL", ["NVDA", "AAPL"]],
    ["NVDA\nAAPL", ["NVDA", "AAPL"]],
    ["NVDA،AAPL", ["NVDA", "AAPL"]],
    ["NVIDIA אנבידיה", ["NVDA"]],
  ])("parses asset separators in %j", (text, symbols) => {
    expect(parseOnboardingText(text).assets.map((asset) => asset.symbol)).toEqual(symbols);
  });

  it.each([
    ["Apple technology", ["AAPL"], ["טכנולוגיה"]],
    ["Bitcoin crypto", ["BTC"], ["קריפטו"]],
    ["Microsoft שבבים", ["MSFT"], ["שבבים"]],
    ["1120300 ביוטק", ["TASE:TEVA"], ["ביוטק ופארמה"]],
    ["SPY global economy", ["SPY"], ["כלכלה עולמית"]],
  ])("extracts mixed input %j", (text, symbols, interests) => {
    const parsed = parseOnboardingText(text);
    expect(parsed.assets.map((asset) => asset.symbol)).toEqual(symbols);
    expect(parsed.interests).toEqual(interests);
  });
});

describe("normalization primitives", () => {
  it.each([
    ["S&P 500", "sp500"], [" Monday.com ", "mondaycom"], ["מָטָא", "מטא"], ["נדל״ן", "נדלן"], ["AI!", "ai"],
  ])("normalizes %j", (value, expected) => expect(conceptKey(value)).toBe(expected));

  it.each([
    ["same", "same", 0], ["apple", "appl", 1], ["apple", "appel", 1], ["cat", "cut", 1], ["cat", "cats", 1],
  ])("computes edit distance for %s and %s", (a, b, distance) => expect(editDistance(a, b)).toBe(distance));
});
