// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ActionResult } from "#/actions/guild-actions";
import type { GuildSettings } from "#/lib/dashboard-data";

const setGuildSettings = vi.fn<() => Promise<ActionResult>>();
vi.mock("#/actions/guild-actions", () => ({
  setGuildSettings,
}));

const { GeneralSettingsForm } = await import(
  "#/components/guild/general-settings-form"
);

function makeSettings(): GuildSettings {
  return {
    prefix: "!",
    locale: "en-US",
    modRoleId: "111111111111111111",
    adminRoleId: null,
    modLogChannelId: null,
    muteRoleId: null,
    timezone: "UTC",
    noMentionSpamWindowMs: null,
    noMentionSpamLimit: null,
  };
}

describe("GeneralSettingsForm (partial guild.settings.set save)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("on save, sends only the field(s) that actually changed", async () => {
    setGuildSettings.mockResolvedValue({ ok: true });
    render(<GeneralSettingsForm guildId="101" settings={makeSettings()} />);

    fireEvent.change(screen.getByLabelText("Locale"), {
      target: { value: "fr-FR" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(setGuildSettings).toHaveBeenCalledWith("101", { locale: "fr-FR" }),
    );
    // Regression guard: modRoleId, timezone, etc. were never touched in this
    // session - sending them back would silently revert any concurrent
    // change (another tab, another admin, a Discord slash command) made to
    // those fields between page load and this save.
    expect(setGuildSettings).toHaveBeenCalledTimes(1);
  });

  it("normalizes an emptied nullable text field to null, but only sends that one field", async () => {
    setGuildSettings.mockResolvedValue({ ok: true });
    render(<GeneralSettingsForm guildId="101" settings={makeSettings()} />);

    fireEvent.change(screen.getByLabelText("Mod role ID"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(setGuildSettings).toHaveBeenCalledWith("101", { modRoleId: null }),
    );
    expect(setGuildSettings).toHaveBeenCalledTimes(1);
  });

  it("saves every changed field when more than one was edited", async () => {
    setGuildSettings.mockResolvedValue({ ok: true });
    render(<GeneralSettingsForm guildId="101" settings={makeSettings()} />);

    fireEvent.change(screen.getByLabelText("Locale"), {
      target: { value: "fr-FR" },
    });
    fireEvent.change(screen.getByLabelText("Timezone"), {
      target: { value: "Europe/Paris" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(setGuildSettings).toHaveBeenCalledWith("101", {
        locale: "fr-FR",
        timezone: "Europe/Paris",
      }),
    );
    expect(setGuildSettings).toHaveBeenCalledTimes(1);
  });

  it("shows an error and keeps the save bar open when a save fails", async () => {
    setGuildSettings.mockResolvedValue({ ok: false, error: "Bad payload" });
    render(<GeneralSettingsForm guildId="101" settings={makeSettings()} />);

    fireEvent.change(screen.getByLabelText("Locale"), {
      target: { value: "fr-FR" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText("Bad payload")).toBeInTheDocument();
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
  });
});
