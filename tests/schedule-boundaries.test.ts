import { describe, expect, it } from "vitest";
import { computeNextRunAt, targetMinutesForPlan } from "../product/lib/schedule";

const daily = (scheduleTime: string) => ({
  podcastPlan: "daily" as const,
  scheduleTime,
  scheduleDay: null,
  scheduleTimezone: "Asia/Jerusalem" as const,
});

describe("daily delivery boundaries", () => {
  it.each([
    ["2026-09-14T00:00:00.000Z", "07:00", "2026-09-14T04:00:00.000Z"],
    ["2026-09-15T00:00:00.000Z", "08:30", "2026-09-15T05:30:00.000Z"],
    ["2026-09-16T10:00:00.000Z", "18:00", "2026-09-16T15:00:00.000Z"],
    ["2026-11-05T00:00:00.000Z", "07:00", "2026-11-05T05:00:00.000Z"],
    ["2026-11-06T00:00:00.000Z", "23:59", "2026-11-06T21:59:00.000Z"],
  ])("keeps Jerusalem wall-clock time after %s", (after, time, expected) => {
    expect(computeNextRunAt(daily(time), new Date(after))).toBe(expected);
  });

  it.each([
    ["2026-09-14T04:00:00.000Z", "07:00", "2026-09-15T04:00:00.000Z"],
    ["2026-09-14T04:01:00.000Z", "07:00", "2026-09-15T04:00:00.000Z"],
    ["2026-09-18T21:59:00.000Z", "23:59", "2026-09-21T20:59:00.000Z"],
    ["2026-09-19T00:00:00.000Z", "07:00", "2026-09-21T04:00:00.000Z"],
    ["2026-09-20T00:00:00.000Z", "07:00", "2026-09-21T04:00:00.000Z"],
  ])("moves elapsed or weekend run after %s", (after, time, expected) => {
    expect(computeNextRunAt(daily(time), new Date(after))).toBe(expected);
  });
});

describe("weekly delivery boundaries", () => {
  it.each([
    [1, "2026-09-14T00:00:00.000Z", "2026-09-14T06:00:00.000Z"],
    [2, "2026-09-14T00:00:00.000Z", "2026-09-15T06:00:00.000Z"],
    [3, "2026-09-14T00:00:00.000Z", "2026-09-16T06:00:00.000Z"],
    [4, "2026-09-14T00:00:00.000Z", "2026-09-17T06:00:00.000Z"],
    [5, "2026-09-14T00:00:00.000Z", "2026-09-18T06:00:00.000Z"],
  ])("schedules weekday %s", (scheduleDay, after, expected) => {
    expect(computeNextRunAt({ podcastPlan: "weekly", scheduleTime: "09:00", scheduleDay, scheduleTimezone: "Asia/Jerusalem" }, new Date(after))).toBe(expected);
  });

  it.each([
    ["daily", 5], ["weekly", 15],
  ] as const)("maps %s plan duration", (plan, minutes) => expect(targetMinutesForPlan(plan)).toBe(minutes));
});
