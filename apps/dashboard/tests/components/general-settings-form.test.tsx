// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { GuildSettingsPayload } from "@lumi/contracts";
import type { ActionResult } from "#/actions/guild-actions";
import type {
  GuildSettings,
  DashboardRoleView,
  DashboardChannelView,
} from "#/lib/dashboard-data";

const setGuildSettings = vi.fn<() => Promise<ActionResult>>();
vi.mock("#/actions/guild-actions", () => ({
  setGuildSettings,
}));

const { GeneralSettingsForm } = await import(
  "#/components/guild/general-settings-form"
);

function baseValues() {
  return {
    prefix: "!",
    modRoleId: "111",
    adminRoleId: "222",
    modLogChannelId: "333",
    muteRoleId: "444",
    locale: "en-US",
    timezone: "UTC",
    noMentionSpamWindowMs: null,
    noMentionSpamLimit: null,
  } as const;
}

function makeSettings(overrides: Partial<GuildSettings> = {}): GuildSettings {
  return { ...baseValues(), ...overrides };
}

function formState(overrides: Partial<GuildSettingsPayload> = {}): GuildSettingsPayload {
  return { ...baseValues(), ...overrides };
}

function guildChannel(guildId: string) {
  return new BroadcastChannel(`lumi:guild-settings:${guildId}`);
}

// Every role id referenced anywhere across these tests (including
// cross-tab-broadcast sentinel values) must exist here so the role <select>
// can represent it as an <option>.
const roles: DashboardRoleView[] = [
  { id: "111", name: "111", color: 0, position: 0, permissions: "0", isBotRole: false },
  { id: "222", name: "222", color: 0, position: 0, permissions: "0", isBotRole: false },
  { id: "444", name: "444", color: 0, position: 0, permissions: "0", isBotRole: false },
  { id: "999", name: "999", color: 0, position: 0, permissions: "0", isBotRole: false },
  { id: "LOCAL-EDIT", name: "LOCAL-EDIT", color: 0, position: 0, permissions: "0", isBotRole: false },
  { id: "REMOTE-CHANGE", name: "REMOTE-CHANGE", color: 0, position: 0, permissions: "0", isBotRole: false },
];

const channels: DashboardChannelView[] = [{ id: "333", name: "333", type: 0 }];

describe("GeneralSettingsForm (partial guild.settings.set save)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("on save, sends only the field(s) that actually changed", async () => {
    setGuildSettings.mockResolvedValue({ ok: true });
    render(
      <GeneralSettingsForm
        guildId="101"
        settings={makeSettings()}
        roles={roles}
        channels={channels}
      />,
    );

    fireEvent.change(screen.getByLabelText("Locale"), {
      target: { value: "fr-FR" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(setGuildSettings).toHaveBeenCalledWith("101", { locale: "fr-FR" }),
    );
    expect(setGuildSettings).toHaveBeenCalledTimes(1);
  });

  it("normalizes an emptied nullable role field to null, but only sends that one field", async () => {
    setGuildSettings.mockResolvedValue({ ok: true });
    render(
      <GeneralSettingsForm
        guildId="101"
        settings={makeSettings()}
        roles={roles}
        channels={channels}
      />,
    );

    fireEvent.change(screen.getByLabelText("Mod role"), {
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
    render(
      <GeneralSettingsForm
        guildId="101"
        settings={makeSettings()}
        roles={roles}
        channels={channels}
      />,
    );

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
    render(
      <GeneralSettingsForm
        guildId="101"
        settings={makeSettings()}
        roles={roles}
        channels={channels}
      />,
    );

    fireEvent.change(screen.getByLabelText("Locale"), {
      target: { value: "fr-FR" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText("Bad payload")).toBeInTheDocument();
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
  });
});

describe("GeneralSettingsForm (cross-tab sync)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("hides the save bar until a field is edited", () => {
    render(
      <GeneralSettingsForm
        guildId="g1"
        settings={makeSettings()}
        roles={roles}
        channels={channels}
      />,
    );
    expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();
  });

  it("adopts a remote settings-updated broadcast from another tab for untouched fields", async () => {
    render(
      <GeneralSettingsForm
        guildId="g1"
        settings={makeSettings()}
        roles={roles}
        channels={channels}
      />,
    );
    expect(screen.getByLabelText("Mod role")).toHaveValue("111");

    const otherTab = guildChannel("g1");
    otherTab.postMessage({
      type: "settings-updated",
      settings: formState({ modRoleId: "999" }),
    });

    await waitFor(() =>
      expect(screen.getByLabelText("Mod role")).toHaveValue("999"),
    );
    expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();

    otherTab.close();
  });

  it("keeps a locally-edited, unsaved field on remote conflict and surfaces an error, while still adopting other untouched fields", async () => {
    render(
      <GeneralSettingsForm
        guildId="g1"
        settings={makeSettings()}
        roles={roles}
        channels={channels}
      />,
    );

    fireEvent.change(screen.getByLabelText("Mod role"), {
      target: { value: "LOCAL-EDIT" },
    });
    expect(screen.getByLabelText("Mod role")).toHaveValue("LOCAL-EDIT");

    const otherTab = guildChannel("g1");
    otherTab.postMessage({
      type: "settings-updated",
      settings: formState({ modRoleId: "REMOTE-CHANGE", adminRoleId: "999" }),
    });

    await waitFor(() =>
      expect(screen.getByLabelText("Admin role")).toHaveValue("999"),
    );
    expect(screen.getByLabelText("Mod role")).toHaveValue("LOCAL-EDIT");
    const conflictMessage = screen.getByText(/changed in another tab/i);
    expect(conflictMessage).toBeInTheDocument();
    expect(conflictMessage).toHaveTextContent("Mod role");
    expect(screen.getByText(/careful.*unsaved changes/i)).toBeInTheDocument();

    otherTab.close();
  });

  it("Reset after a remote update loads the latest value, not the stale one from page load", async () => {
    render(
      <GeneralSettingsForm
        guildId="g1"
        settings={makeSettings()}
        roles={roles}
        channels={channels}
      />,
    );

    const otherTab = guildChannel("g1");
    otherTab.postMessage({
      type: "settings-updated",
      settings: formState({ modRoleId: "999" }),
    });
    await waitFor(() =>
      expect(screen.getByLabelText("Mod role")).toHaveValue("999"),
    );

    fireEvent.change(screen.getByLabelText("Admin role"), {
      target: { value: "999" },
    });
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(screen.getByLabelText("Mod role")).toHaveValue("999");
    expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();

    otherTab.close();
  });

  it("broadcasts the saved settings on success so another open tab can pick them up", async () => {
    setGuildSettings.mockResolvedValue({ ok: true });
    render(
      <GeneralSettingsForm
        guildId="g1"
        settings={makeSettings()}
        roles={roles}
        channels={channels}
      />,
    );

    const otherTab = guildChannel("g1");
    const updates: GuildSettingsPayload[] = [];
    otherTab.onmessage = (event) => {
      if (event.data?.type === "settings-updated") updates.push(event.data.settings);
    };

    fireEvent.change(screen.getByLabelText("Command prefix"), {
      target: { value: "?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(updates.length).toBeGreaterThan(0));
    expect(updates.at(-1)).toMatchObject({ prefix: "?" });

    otherTab.close();
  });

  it("requests a sync on mount so it catches up on a save it missed (e.g. it opened after the other tab saved)", async () => {
    const existingTab = guildChannel("g1");
    existingTab.onmessage = (event) => {
      if (event.data?.type === "request-sync") {
        existingTab.postMessage({
          type: "settings-updated",
          settings: formState({ prefix: "?" }),
        });
      }
    };

    render(
      <GeneralSettingsForm
        guildId="g1"
        settings={makeSettings()}
        roles={roles}
        channels={channels}
      />,
    );

    await waitFor(() =>
      expect(screen.getByLabelText("Command prefix")).toHaveValue("?"),
    );

    existingTab.close();
  });
});
