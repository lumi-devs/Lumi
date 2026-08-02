// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Session } from "next-auth";

// app/page.tsx -> SiteHeader -> actions/auth-actions -> lib/auth calls
// `NextAuth({...})` at module load using real env vars via lib/env — both
// mocked here so this stays a hermetic unit test of the page's branching
// logic (landing vs. guild picker), not an integration test of NextAuth
// itself.
const authMock = vi.fn<() => Promise<Session | null>>();
vi.mock("#/lib/auth", () => ({
  auth: authMock,
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: { GET: vi.fn(), POST: vi.fn() },
}));
vi.mock("#/lib/env", () => ({
  env: { discordClientId: "123456789012345678", botOwners: [] },
  isBotOwner: () => false,
}));

const { default: HomePage } = await import("#/app/page");

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

describe("/ (dashboard.md §11: landing when signed out, server picker when signed in)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the public marketing landing page when there is no session", async () => {
    authMock.mockResolvedValue(null);

    render(await HomePage());

    expect(
      screen.getByRole("heading", { name: /next-generation/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /login/i })).toBeInTheDocument();
    // Guild picker content must not leak through for a signed-out visitor.
    expect(screen.queryByText(/your servers/i)).not.toBeInTheDocument();
  });

  it("renders the guild picker (not the landing page) once signed in", async () => {
    authMock.mockResolvedValue(
      makeSession({
        guilds: [{ id: "101", name: "My Guild", icon: null, permissions: "0x20" }],
      }),
    );

    render(await HomePage());

    expect(screen.getByText(/your servers/i)).toBeInTheDocument();
    expect(screen.getByText("My Guild")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /next-generation/i }),
    ).not.toBeInTheDocument();
  });

  it("shows a 'no servers' message for a signed-in user who manages nothing", async () => {
    authMock.mockResolvedValue(makeSession({ guilds: [] }));

    render(await HomePage());

    expect(screen.getByText(/no servers where you have/i)).toBeInTheDocument();
  });
});
