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
const { GuildPicker } = await import("#/components/guild-picker");

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

describe("HomePage & GuildPicker", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the public marketing landing page when there is no session", async () => {
    authMock.mockResolvedValue(null);

    render(await HomePage());

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/moderation/i);
    expect(screen.getByRole("link", { name: "Login" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /add to discord/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open dashboard/i })).toBeInTheDocument();
  });

  it("renders the public marketing landing page with user profile in header when signed in", async () => {
    authMock.mockResolvedValue(
      makeSession({
        username: "alex",
        guilds: [{ id: "101", name: "My Guild", icon: null, permissions: "0x20" }],
      }),
    );

    render(await HomePage());

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/moderation/i);
    expect(screen.getByText("alex")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /log out/i })).toBeInTheDocument();
  });

  it("renders manageable servers in GuildPicker", () => {
    const session = makeSession({
      guilds: [{ id: "101", name: "My Guild", icon: null, permissions: "0x20" }],
    });

    render(<GuildPicker session={session} summaries={[]} />);

    expect(screen.getByText(/your servers/i)).toBeInTheDocument();
    expect(screen.getByText("My Guild")).toBeInTheDocument();
  });

  it("shows a 'no servers' empty state in GuildPicker for a user who manages nothing", () => {
    const session = makeSession({ guilds: [] });

    render(<GuildPicker session={session} summaries={[]} />);

    expect(
      screen.getByText(/no servers where you have manage server/i),
    ).toBeInTheDocument();
  });
});

