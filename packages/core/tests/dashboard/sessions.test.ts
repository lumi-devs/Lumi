import { describe, it, expect } from "vitest";

process.env.DASHBOARD_SESSION_SECRET = "test-secret-key-32-chars-long-abc";
process.env.RABBITMQ_URL = "amqp://localhost";
process.env.DISCORD_OAUTH2_CLIENT_ID = "123456789";
process.env.DISCORD_OAUTH2_CLIENT_SECRET = "secret";
process.env.DISCORD_OAUTH2_REDIRECT_URI = "http://localhost:8080/callback";

const {
  createSession,
  readSession,
  destroySession,
  sessionCookie,
  clearSessionCookie,
  issueState,
  verifyState,
  clearStateCookie,
} = await import("../../../../apps/dashboard/src/sessions.js");

describe("Dashboard Sessions Security & Functionality", () => {
  const dummySessionData = {
    userId: "user-123",
    username: "testuser",
    avatar: "avatar.png",
    accessToken: "access-token-xyz",
    guilds: [],
  };

  it("creates and reads valid sessions", () => {
    const sessionId = createSession(dummySessionData);
    expect(sessionId).toBeDefined();

    const setCookie = sessionCookie(sessionId);
    expect(setCookie).toContain("lumi_dash=");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");

    // Cookie must contain the raw session ID (opaque token, no signing suffix)
    expect(setCookie).toContain(sessionId);

    const session = readSession(setCookie);
    expect(session).not.toBeNull();
    expect(session?.userId).toBe("user-123");
    expect(session?.username).toBe("testuser");
  });

  it("rejects unknown / forged session IDs", () => {
    createSession(dummySessionData);

    // Completely unknown ID → no session in store
    expect(readSession("lumi_dash=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")).toBeNull();

    // Mutated known ID → not in store
    const sessionId = createSession(dummySessionData);
    const mutated = sessionId.slice(0, -3) + "XXX";
    expect(readSession(`lumi_dash=${mutated}`)).toBeNull();
  });

  it("destroys session when requested", () => {
    const sessionId = createSession(dummySessionData);
    const cookie = sessionCookie(sessionId);
    expect(readSession(cookie)).not.toBeNull();

    destroySession(cookie);
    expect(readSession(cookie)).toBeNull();
  });

  it("issues and verifies OAuth state with timing-safe comparison", () => {
    const { state, cookie } = issueState();
    expect(state).toBeDefined();
    expect(cookie).toContain("lumi_oauth_state=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");

    // Correct state returns true
    expect(verifyState(cookie, state)).toBe(true);

    // Wrong state returns false
    expect(verifyState(cookie, "wrong-state")).toBe(false);

    // Tampered state cookie (state value differs from received) returns false
    const tamperedCookie = `lumi_oauth_state=TAMPERED${state}`;
    expect(verifyState(tamperedCookie, state)).toBe(false);

    // Missing state header returns false
    expect(verifyState(null, state)).toBe(false);
  });

  it("clears session and state cookies with Max-Age=0", () => {
    const clearedSession = clearSessionCookie();
    expect(clearedSession).toContain("Max-Age=0");
    expect(clearedSession).toContain("lumi_dash=");

    const clearedState = clearStateCookie();
    expect(clearedState).toContain("Max-Age=0");
    expect(clearedState).toContain("lumi_oauth_state=");
  });
});
