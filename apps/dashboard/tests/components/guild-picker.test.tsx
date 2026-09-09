// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Session } from "next-auth";
import type { GuildSummaryView } from "@lumi/contracts";
import { GuildPicker } from "#/components/guild-picker";

// GuildPicker refreshes the server list when the tab is returned to after an
// invite; the router is not mounted in a bare render.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: vi.fn() }),
}));

const ClientId = "client-123";

function sessionWith(ids: string[]): Session {
  return {
    guilds: ids.map((id, index) => ({
      id,
      name: id === "installed-1" ? "Alpha" : `Server ${index}`,
      icon: null,
      permissions: "32",
      owner: id === "installed-1",
    })),
  } as unknown as Session;
}

const summaries: GuildSummaryView[] = [
  { guildId: "installed-1", icon: null, banner: null, memberCount: 42 },
];

describe("GuildPicker", () => {
  it("links installed guilds to their dashboard", () => {
    render(
      <GuildPicker
        session={sessionWith(["installed-1", "missing-1"])}
        summaries={summaries}
        clientId={ClientId}
      />,
    );

    const open = screen.getByRole("link", { name: /Open dashboard/ });
    expect(open).toHaveAttribute("href", "/guild/installed-1");
  });

  it("shows an invite action instead of a dashboard link for bot-less guilds", () => {
    const { container } = render(
      <GuildPicker
        session={sessionWith(["installed-1", "missing-1"])}
        summaries={summaries}
        clientId={ClientId}
      />,
    );

    expect(screen.getByText("Invite needed")).toBeInTheDocument();
    const invite = screen.getByRole("link", { name: /Invite Lumi/ });
    const href = invite.getAttribute("href") ?? "";
    expect(href).toContain("https://discord.com/oauth2/authorize");
    expect(href).toContain(`client_id=${ClientId}`);
    expect(href).toContain("guild_id=missing-1");
    expect(href).toContain("disable_guild_select=true");
    expect(invite).toHaveAttribute("target", "_blank");
    expect(
      container.querySelector('a[href="/guild/missing-1"]'),
    ).not.toBeInTheDocument();
  });
});
