import { beforeEach, describe, expect, it, vi } from "vitest";
import { responseJson } from "./helpers";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  assertSupabase: vi.fn((error: { message: string } | null, operation: string) => {
    if (error) throw new Error(`${operation}: ${error.message}`);
  }),
  createBrief: vi.fn(),
  sendDueNotifications: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/db", () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
  assertSupabase: mocks.assertSupabase,
  AUDIO_BUCKET: "vestory-audio",
  audioObjectPath: (briefId: string, value: string) => value.includes("/") ? value : `${briefId}/${value}`,
}));
vi.mock("@/lib/briefs", () => ({
  createBrief: mocks.createBrief,
  sendDueNotifications: mocks.sendDueNotifications,
}));

import { GET as keepalive } from "../product/app/api/keepalive/route";
import { GET as schedulerGet, POST as schedulerPost } from "../product/app/api/scheduler/tick/route";
import { GET as audio } from "../product/app/api/briefs/[id]/audio/[chapter]/route";

beforeEach(() => {
  delete process.env.KEEPALIVE_SECRET;
  delete process.env.CRON_SECRET;
  mocks.getCurrentUser.mockResolvedValue(null);
  mocks.createBrief.mockResolvedValue("brief-1");
  mocks.sendDueNotifications.mockResolvedValue(0);
});

describe("Supabase keepalive", () => {
  it("fails closed when the secret is not configured", async () => {
    const response = await keepalive(new Request("https://www.slinon.me/api/keepalive"));
    expect(response.status).toBe(503);
    expect(await responseJson(response)).toEqual({ ok: false, error: "keepalive_not_configured" });
  });

  it("rejects missing and incorrect bearer tokens", async () => {
    process.env.KEEPALIVE_SECRET = "correct-secret";
    for (const authorization of [undefined, "Bearer wrong-secret"]) {
      const headers = authorization ? { authorization } : undefined;
      const response = await keepalive(new Request("https://www.slinon.me/api/keepalive", { headers }));
      expect(response.status).toBe(401);
    }
  });

  it("performs one bounded read and disables response caching", async () => {
    process.env.KEEPALIVE_SECRET = "correct-secret";
    const limit = vi.fn().mockResolvedValue({ data: [], error: null });
    const select = vi.fn(() => ({ limit }));
    mocks.getSupabaseAdmin.mockReturnValue({ from: vi.fn(() => ({ select })) });
    const response = await keepalive(new Request("https://www.slinon.me/api/keepalive", {
      headers: { authorization: "Bearer correct-secret" },
    }));
    expect(await responseJson(response)).toEqual({ ok: true, database: "reachable" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(select).toHaveBeenCalledWith("user_id");
    expect(limit).toHaveBeenCalledWith(1);
  });
});

describe("podcast scheduler", () => {
  it("supports both cron GET and manual POST while requiring configuration", async () => {
    const get = await schedulerGet(new Request("https://www.slinon.me/api/scheduler/tick"));
    const post = await schedulerPost(new Request("https://www.slinon.me/api/scheduler/tick", { method: "POST" }));
    expect(get.status).toBe(503);
    expect(post.status).toBe(503);
  });

  it("requires the exact configured bearer token", async () => {
    process.env.CRON_SECRET = "scheduler-secret";
    const response = await schedulerGet(new Request("https://www.slinon.me/api/scheduler/tick", {
      headers: { authorization: "Bearer wrong" },
    }));
    expect(response.status).toBe(401);
    expect(await responseJson(response)).toEqual({ error: "unauthorized" });
  });

  it("does not start a generation before its twenty-minute lead window", async () => {
    process.env.CRON_SECRET = "scheduler-secret";
    const future = new Date(Date.now() + 21 * 60 * 1000).toISOString();
    const rows = { data: [{
      user_id: "user-1", onboarding_complete: true, podcast_plan: "daily",
      schedule_time: "07:00", schedule_day: null, schedule_timezone: "Asia/Jerusalem", next_run_at: future,
    }], error: null };
    const not = vi.fn().mockResolvedValue(rows);
    const eq = vi.fn(() => ({ not }));
    mocks.getSupabaseAdmin.mockReturnValue({ from: vi.fn(() => ({ select: vi.fn(() => ({ eq })) })) });

    const response = await schedulerGet(new Request("https://www.slinon.me/api/scheduler/tick", {
      headers: { authorization: "Bearer scheduler-secret" },
    }));
    const body = await responseJson(response);
    expect(body).toMatchObject({ processed: 1, notified: 0 });
    expect(body.results).toEqual([{ userId: "user-1", status: "not_due" }]);
    expect(mocks.createBrief).not.toHaveBeenCalled();
    expect(mocks.sendDueNotifications).toHaveBeenCalledOnce();
  });
});

describe("private audio streaming", () => {
  it("requires authentication before looking up a brief or storage object", async () => {
    const response = await audio(new Request("https://www.slinon.me/api/briefs/brief-1/audio/full"), {
      params: Promise.resolve({ id: "brief-1", chapter: "full" }),
    });
    expect(response.status).toBe(401);
    expect(await responseJson(response)).toEqual({ error: "unauthorized" });
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("hides a brief that is not owned by the current user", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "user-1" });
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eqUser = vi.fn(() => ({ maybeSingle }));
    const eqId = vi.fn(() => ({ eq: eqUser }));
    const select = vi.fn(() => ({ eq: eqId }));
    mocks.getSupabaseAdmin.mockReturnValue({ from: vi.fn(() => ({ select })) });

    const response = await audio(new Request("https://www.slinon.me/api/briefs/foreign/audio/full"), {
      params: Promise.resolve({ id: "foreign", chapter: "full" }),
    });
    expect(response.status).toBe(404);
    expect(await responseJson(response)).toEqual({ error: "not_found" });
    expect(eqId).toHaveBeenCalledWith("id", "foreign");
    expect(eqUser).toHaveBeenCalledWith("user_id", "user-1");
  });
});
