export type PodcastPlan = "daily" | "weekly";

export type PodcastSchedule = {
  podcastPlan: PodcastPlan;
  scheduleTime: string;
  scheduleDay: number | null;
  scheduleTimezone: "Asia/Jerusalem";
};

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
};

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function partsInTimezone(date: Date, timezone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    hour: Number(value("hour")),
    minute: Number(value("minute")),
    weekday: WEEKDAY_INDEX[value("weekday")] ?? 0,
  };
}

function localDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
) {
  const targetWallClock = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = targetWallClock;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = partsInTimezone(new Date(candidate), timezone);
    const actualWallClock = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute);
    candidate += targetWallClock - actualWallClock;
  }
  return new Date(candidate);
}

export function targetMinutesForPlan(plan: PodcastPlan): 5 | 10 {
  return plan === "daily" ? 5 : 10;
}

export function computeNextRunAt(schedule: PodcastSchedule, after = new Date()): string {
  const local = partsInTimezone(after, schedule.scheduleTimezone);
  const [hour, minute] = schedule.scheduleTime.split(":").map(Number);
  const localMidnight = new Date(Date.UTC(local.year, local.month - 1, local.day));

  let daysAhead = 0;
  if (schedule.podcastPlan === "weekly") {
    daysAhead = ((schedule.scheduleDay ?? 1) - local.weekday + 7) % 7;
  } else if (local.weekday === 6) {
    daysAhead = 2;
  } else if (local.weekday === 0) {
    daysAhead = 1;
  }

  let targetDate = new Date(localMidnight.getTime() + daysAhead * 86_400_000);
  let candidate = localDateTimeToUtc(
    targetDate.getUTCFullYear(),
    targetDate.getUTCMonth() + 1,
    targetDate.getUTCDate(),
    hour,
    minute,
    schedule.scheduleTimezone,
  );

  if (candidate.getTime() <= after.getTime()) {
    const targetWeekday = (local.weekday + daysAhead) % 7;
    const daysToAdd = schedule.podcastPlan === "weekly" ? 7 : targetWeekday === 5 ? 3 : 1;
    targetDate = new Date(targetDate.getTime() + daysToAdd * 86_400_000);
    candidate = localDateTimeToUtc(
      targetDate.getUTCFullYear(),
      targetDate.getUTCMonth() + 1,
      targetDate.getUTCDate(),
      hour,
      minute,
      schedule.scheduleTimezone,
    );
  }

  return candidate.toISOString();
}
