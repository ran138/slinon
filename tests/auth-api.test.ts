import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonRequest, responseJson } from "./helpers";

const authMocks = vi.hoisted(() => ({
  getAuthClient: vi.fn(),
}));

vi.mock("@/lib/auth", () => authMocks);

import { GET as oauth } from "../product/app/api/auth/oauth/[provider]/route";
import { POST as resendConfirmation } from "../product/app/api/auth/resend-confirmation/route";
import { POST as resetPassword } from "../product/app/api/auth/reset-password/route";
import { POST as signIn } from "../product/app/api/auth/sign-in/route";
import { POST as signOut } from "../product/app/api/auth/sign-out/route";
import { POST as signUp } from "../product/app/api/auth/sign-up/route";
import { POST as updatePassword } from "../product/app/api/auth/update-password/route";
import { GET as authCallback } from "../product/app/auth/callback/route";

function authClient(overrides: Record<string, unknown> = {}) {
  return {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      signUp: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      resend: vi.fn().mockResolvedValue({ error: null }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
      updateUser: vi.fn().mockResolvedValue({ error: null }),
      signInWithOAuth: vi.fn().mockResolvedValue({ data: { url: "https://provider.example/authorize" }, error: null }),
      exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
      ...overrides,
    },
  };
}

beforeEach(() => {
  authMocks.getAuthClient.mockResolvedValue(authClient());
});

describe("authentication API", () => {
  it.each([
    [signIn, { email: "user@example.com", password: "password" }],
    [signUp, { email: "user@example.com", password: "long-password", agreedToTerms: true }],
    [signOut, {}],
    [resendConfirmation, { email: "user@example.com" }],
    [resetPassword, { email: "user@example.com" }],
    [updatePassword, { password: "long-password" }],
  ])("blocks cross-origin state changes", async (handler, body) => {
    const response = await handler(jsonRequest("/api/auth/action", body, { origin: "https://evil.example" }));
    expect(response.status).toBe(403);
    expect(await responseJson(response)).toEqual({ error: "origin_not_allowed" });
    expect(authMocks.getAuthClient).not.toHaveBeenCalled();
  });

  it("rejects malformed sign-in input", async () => {
    const response = await signIn(jsonRequest("/api/auth/sign-in", { email: "not-an-email", password: "" }));
    expect(response.status).toBe(400);
    expect(await responseJson(response)).toEqual({ error: "invalid_input" });
  });

  it("returns a stable error code for failed credentials", async () => {
    authMocks.getAuthClient.mockResolvedValue(authClient({
      signInWithPassword: vi.fn().mockResolvedValue({ error: { code: "invalid_credentials" } }),
    }));
    const response = await signIn(jsonRequest("/api/auth/sign-in", { email: "user@example.com", password: "wrong" }));
    expect(response.status).toBe(401);
    expect(await responseJson(response)).toEqual({ error: "invalid_credentials" });
  });

  it("requires explicit terms acceptance during sign-up", async () => {
    const response = await signUp(jsonRequest("/api/auth/sign-up", {
      email: "user@example.com", password: "long-password", agreedToTerms: false,
    }));
    expect(response.status).toBe(400);
    expect(await responseJson(response)).toEqual({ error: "terms_not_agreed" });
  });

  it("records timestamped terms acceptance and reports required confirmation", async () => {
    const client = authClient();
    authMocks.getAuthClient.mockResolvedValue(client);
    const response = await signUp(jsonRequest("/api/auth/sign-up", {
      email: "user@example.com", password: "long-password", agreedToTerms: true,
    }));
    expect(response.status).toBe(200);
    expect(await responseJson(response)).toEqual({ ok: true, needsConfirmation: true });
    expect(client.auth.signUp).toHaveBeenCalledWith(expect.objectContaining({
      email: "user@example.com",
      options: expect.objectContaining({
        emailRedirectTo: "https://www.slinon.me/auth/callback",
        data: { terms_accepted_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) },
      }),
    }));
  });

  it("does not reveal whether a reset or confirmation email is registered", async () => {
    const client = authClient({
      resend: vi.fn().mockResolvedValue({ error: { message: "unknown user" } }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ error: { message: "unknown user" } }),
    });
    authMocks.getAuthClient.mockResolvedValue(client);
    const resend = await resendConfirmation(jsonRequest("/api/auth/resend-confirmation", { email: "missing@example.com" }));
    const reset = await resetPassword(jsonRequest("/api/auth/reset-password", { email: "missing@example.com" }));
    expect(await responseJson(resend)).toEqual({ ok: true });
    expect(await responseJson(reset)).toEqual({ ok: true });
  });

  it("updates a recovery-session password and signs out with no body", async () => {
    const update = await updatePassword(jsonRequest("/api/auth/update-password", { password: "new-password" }));
    const logout = await signOut(jsonRequest("/api/auth/sign-out", {}));
    expect(await responseJson(update)).toEqual({ ok: true });
    expect(logout.status).toBe(204);
  });

  it("only starts OAuth for supported providers and preserves the requested app path", async () => {
    const client = authClient();
    authMocks.getAuthClient.mockResolvedValue(client);
    const unsupported = await oauth(new Request("https://www.slinon.me/api/auth/oauth/twitter"), {
      params: Promise.resolve({ provider: "twitter" }),
    });
    expect(unsupported.headers.get("location")).toBe("https://www.slinon.me/login?error=unsupported_provider");

    const supported = await oauth(new Request("https://www.slinon.me/api/auth/oauth/google?next=%2Fvestory_app%2Ftoday"), {
      params: Promise.resolve({ provider: "google" }),
    });
    expect(supported.headers.get("location")).toBe("https://provider.example/authorize");
    expect(client.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "https://www.slinon.me/auth/callback?next=%2Fvestory_app%2Ftoday",
        skipBrowserRedirect: true,
      },
    });
  });

  it("sends recovery sessions to password confirmation", async () => {
    const response = await authCallback(new Request("https://www.slinon.me/auth/callback?code=abc&type=recovery"));
    expect(response.headers.get("location")).toBe("https://www.slinon.me/reset-password/confirm");
  });

  it("returns successful OAuth users to a relative app destination", async () => {
    const response = await authCallback(new Request("https://www.slinon.me/auth/callback?code=abc&next=%2Fvestory_app%2Farchive"));
    expect(response.headers.get("location")).toBe("https://www.slinon.me/vestory_app/archive");
  });

  it("never redirects an OAuth callback to a protocol-relative external host", async () => {
    const response = await authCallback(new Request("https://www.slinon.me/auth/callback?code=abc&next=%2F%2Fevil.example"));
    expect(response.headers.get("location")).toBe("https://www.slinon.me/vestory_app");
  });

  it("hides upstream OAuth details behind one user-safe error", async () => {
    const response = await authCallback(new Request(
      "https://www.slinon.me/auth/callback?error=access_denied&error_code=secret&error_description=raw-provider-detail",
    ));
    expect(response.headers.get("location")).toBe("https://www.slinon.me/login?error=auth_callback_failed");
    expect(response.headers.get("location")).not.toContain("raw-provider-detail");
  });
});
