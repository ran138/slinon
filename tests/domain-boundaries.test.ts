import { describe, expect, it } from "vitest";
import { assetInputSchema, profileUpdateSchema } from "../product/lib/domain";

const base = {
  targetMinutes: 5,
  podcastPlan: "daily" as const,
  scheduleTime: "07:00",
  scheduleDay: null,
  scheduleTimezone: "Asia/Jerusalem" as const,
  notifyByEmail: true,
  onboardingComplete: true,
  assets: [{ kind: "holding" as const, name: "Apple", symbol: "AAPL" }],
  interests: [],
};

describe("asset field boundaries", () => {
  it.each([
    ["holding", true], ["watchlist", true], ["portfolio", false], ["", false], [null, false],
  ])("validates asset kind %j", (kind, success) => {
    expect(assetInputSchema.safeParse({ kind, name: "Apple", symbol: "AAPL" }).success).toBe(success);
  });

  it.each([
    ["A", true], ["x".repeat(100), true], ["", false], ["   ", false], ["x".repeat(101), false],
  ])("validates asset name length", (name, success) => {
    expect(assetInputSchema.safeParse({ kind: "holding", name, symbol: "AAPL" }).success).toBe(success);
  });

  it.each([
    ["A", true], ["x".repeat(20), true], ["", false], ["   ", false], ["x".repeat(21), false],
  ])("validates symbol length", (symbol, success) => {
    expect(assetInputSchema.safeParse({ kind: "holding", name: "Asset", symbol }).success).toBe(success);
  });

  it.each([
    ["assetClass", "x".repeat(40), true], ["assetClass", "x".repeat(41), false],
    ["exchange", "x".repeat(40), true], ["exchange", "x".repeat(41), false],
    ["currency", "x".repeat(10), true], ["currency", "x".repeat(11), false],
  ])("enforces optional field %s boundary", (field, value, success) => {
    expect(assetInputSchema.safeParse({ kind: "holding", name: "Asset", symbol: "A", [field]: value }).success).toBe(success);
  });
});

describe("profile schedule boundaries", () => {
  it.each([
    ["00:00", true], ["23:59", true], ["09:05", true], ["24:00", false], ["12:60", false], ["9:05", false], ["09:5", false],
  ])("validates wall-clock time %s", (scheduleTime, success) => {
    expect(profileUpdateSchema.safeParse({ ...base, scheduleTime }).success).toBe(success);
  });

  it.each([
    [1, true], [2, true], [3, true], [4, true], [5, true], [0, false], [6, false], [2.5, false],
  ])("validates weekly weekday %s", (scheduleDay, success) => {
    expect(profileUpdateSchema.safeParse({ ...base, podcastPlan: "weekly", scheduleDay }).success).toBe(success);
  });

  it.each([
    [5, true], [10, true], [15, true], [1, false], [20, false], ["5", false],
  ])("validates target duration %j", (targetMinutes, success) => {
    expect(profileUpdateSchema.safeParse({ ...base, targetMinutes }).success).toBe(success);
  });
});

describe("profile collection boundaries", () => {
  it.each([
    [0, false], [1, true], [49, true], [50, true], [51, false],
  ])("validates asset collection size %s", (count, success) => {
    const assets = Array.from({ length: count }, (_, index) => ({ kind: "watchlist" as const, name: `Asset ${index}`, symbol: `A${index}` }));
    expect(profileUpdateSchema.safeParse({ ...base, assets, interests: [] }).success).toBe(success);
  });

  it.each([
    [1, true], [29, true], [30, true], [31, false],
  ])("validates interest collection size %s", (count, success) => {
    const interests = Array.from({ length: count }, (_, index) => ({ label: `Topic ${index}` }));
    expect(profileUpdateSchema.safeParse({ ...base, assets: [], interests }).success).toBe(success);
  });

  it.each([
    ["A", true], ["x".repeat(80), true], ["", false], ["   ", false], ["x".repeat(81), false],
  ])("validates interest label boundary", (label, success) => {
    expect(profileUpdateSchema.safeParse({ ...base, assets: [], interests: [{ label }] }).success).toBe(success);
  });
});
