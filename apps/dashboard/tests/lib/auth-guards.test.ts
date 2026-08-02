import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "next-auth";

// `redirect`/`notFound` normally throw a special Next control-flow error to
// halt rendering — mocked here to do the same (rather than silently
// returning) so a test that forgets to assert on them still fails loudly
// instead of falling through to code that assumes an authenticated session.
const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("next/navigation", () => ({ redirect, notFound }));

// `#/lib/auth` calls `NextAuth({...})` at module load time, which reads
// required env vars via `#/lib/env` — never something a unit test should
// pull in for real. Mock the one export auth-guards.ts actually uses.
const authMock = vi.fn<() => Promise<Session | null>>();
vi.mock("#/lib/auth", () => ({ auth: authMock }));

const {
  authorizedGuild,
  requireSession,
  requireGuild,
  requireBotOwner,
} = await import("#/lib/auth-guards");

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    userId: "1",
    username: "alex",
    avatar: "https://cdn.discordapp.com/embed/avatars/0.png",
    accessToken: "token",
    guilds: [],
    isBotOwner: false,
    user: {},
    expires: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  } as Session;
}

describe("authorizedGuild (IDOR guard)", () => {
  it("is false when the guild isn't in the session's guild list at all", () => {
    const session = makeSession({
      guilds: [{ id: "999", name: "Other", icon: null, permissions: "8" }],
    });
    expect(authorizedGuild(session, "101")).toBe(false);
  });

  it("is false when the guild is present but the user lacks Manage Server and isn't owner", () => {
    // permissions bitfield without MANAGE_GUILD (0x20) set — e.g. 0x1 (CREATE_INSTANT_INVITE) only.
    const session = makeSession({
      guilds: [{ id: "101", name: "Mine", icon: null, permissions: "1", owner: false }],
    });
    expect(authorizedGuild(session, "101")).toBe(false);
  });

  it("is true when the guild is present and the user has Manage Server", () => {
    const session = makeSession({
      // 0x20 = MANAGE_GUILD
      guilds: [{ id: "101", name: "Mine", icon: null, permissions: "0x20" }],
    });
    expect(authorizedGuild(session, "101")).toBe(true);
  });

  it("is true when the guild is present and the user is the owner (regardless of permissions bitfield)", () => {
    const session = makeSession({
      guilds: [{ id: "101", name: "Mine", icon: null, permissions: "0", owner: true }],
    });
    expect(authorizedGuild(session, "101")).toBe(true);
  });

  it("does not authorize a different guild than the one the session actually manages (the core IDOR case)", () => {
    // Regression guard for the exact attack dashboard.md §5B calls out:
    // changing /guild/101 to /guild/999 in the address bar.
    const session = makeSession({
      guilds: [{ id: "101", name: "Mine", icon: null, permissions: "0x20", owner: true }],
    });
    expect(authorizedGuild(session, "999")).toBe(false);
  });
});

describe("requireSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the session when signed in", async () => {
    const session = makeSession();
    authMock.mockResolvedValue(session);
    await expect(requireSession()).resolves.toBe(session);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects to /login and throws when there is no session", async () => {
    authMock.mockResolvedValue(null);
    await expect(requireSession()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(redirect).toHaveBeenCalledWith("/login");
  });
});

describe("requireGuild", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the session when the caller manages the guild", async () => {
    const session = makeSession({
      guilds: [{ id: "101", name: "Mine", icon: null, permissions: "0x20" }],
    });
    authMock.mockResolvedValue(session);
    await expect(requireGuild("101")).resolves.toBe(session);
    expect(notFound).not.toHaveBeenCalled();
  });

  it("404s (not 403s) when the caller does not manage the guild", async () => {
    const session = makeSession({
      guilds: [{ id: "555", name: "Someone Else's", icon: null, permissions: "0x20" }],
    });
    authMock.mockResolvedValue(session);
    await expect(requireGuild("101")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledOnce();
  });

  it("404s for a guild the caller doesn't manage even when they manage a *different* guild", async () => {
    const session = makeSession({
      guilds: [{ id: "101", name: "Mine", icon: null, permissions: "0x20" }],
    });
    authMock.mockResolvedValue(session);
    await expect(requireGuild("999")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("redirects to /login (not notFound) when there is no session at all", async () => {
    authMock.mockResolvedValue(null);
    await expect(requireGuild("101")).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(notFound).not.toHaveBeenCalled();
  });
});

describe("requireBotOwner (privilege-escalation guard)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the session when isBotOwner is true", async () => {
    const session = makeSession({ isBotOwner: true });
    authMock.mockResolvedValue(session);
    await expect(requireBotOwner()).resolves.toBe(session);
    expect(notFound).not.toHaveBeenCalled();
  });

  it("404s a regular authenticated (non-owner) session — the exact escalation path dashboard.md §5 calls out", async () => {
    const session = makeSession({ isBotOwner: false });
    authMock.mockResolvedValue(session);
    await expect(requireBotOwner()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledOnce();
  });

  it("redirects unauthenticated callers to /login instead of leaking a 404 vs redirect distinction", async () => {
    authMock.mockResolvedValue(null);
    await expect(requireBotOwner()).rejects.toThrow("NEXT_REDIRECT:/login");
  });
});
