// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { GuildSettingsPayload } from "@lumi/contracts";
import type { ActionResult } from "#/actions/guild-actions";
import type { GuildSettings } from "#/lib/dashboard-data";

const setGuildSettings = vi.fn<() => Promise<ActionResult>>();
vi.mock("#/actions/guild-actions", () => ({
  setGuildSettings,
}));

const { GeneralSettingsForm } = await import(
  "#/components/guild/general-settings-form"
);

// Values shared by both the `GuildSettings` (server prop) and
// `GuildSettingsPayload`/form-state shapes used below — same field names,
// same values, just different optionality, so one object literal is
// assignable to either.
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

describe("GeneralSettingsForm (cross-tab sync)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("hides the save bar until a field is edited", () => {
    render(<GeneralSettingsForm guildId="g1" settings={makeSettings()} />);
    expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();
  });

  it("adopts a remote settings-updated broadcast from another tab for untouched fields", async () => {
    render(<GeneralSettingsForm guildId="g1" settings={makeSettings()} />);
    expect(screen.getByLabelText("Mod role ID")).toHaveValue("111");

    // Simulate a second open tab for the same guild that just saved a
    // change to modRoleId.
    const otherTab = guildChannel("g1");
    otherTab.postMessage({
      type: "settings-updated",
      settings: formState({ modRoleId: "999" }),
    });

    await waitFor(() =>
      expect(screen.getByLabelText("Mod role ID")).toHaveValue("999"),
    );
    // No local edits were in flight, so nothing should look "unsaved".
    expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();

    otherTab.close();
  });

  it("keeps a locally-edited, unsaved field on remote conflict and surfaces an error, while still adopting other untouched fields", async () => {
    render(<GeneralSettingsForm guildId="g1" settings={makeSettings()} />);

    // User starts editing Mod role ID here but hasn't saved yet.
    fireEvent.change(screen.getByLabelText("Mod role ID"), {
      target: { value: "LOCAL-EDIT" },
    });
    expect(screen.getByLabelText("Mod role ID")).toHaveValue("LOCAL-EDIT");

    // Another tab saves changes to *both* modRoleId (conflict) and
    // adminRoleId (untouched here).
    const otherTab = guildChannel("g1");
    otherTab.postMessage({
      type: "settings-updated",
      settings: formState({ modRoleId: "REMOTE-CHANGE", adminRoleId: "999" }),
    });

    // The untouched field adopts the remote value...
    await waitFor(() =>
      expect(screen.getByLabelText("Admin role ID")).toHaveValue("999"),
    );
    // ...but the field the user is actively (and not yet successfully)
    // editing is NOT clobbered by the remote value.
    expect(screen.getByLabelText("Mod role ID")).toHaveValue("LOCAL-EDIT");
    // ...and the conflict is surfaced rather than silently resolved.
    const conflictMessage = screen.getByText(/changed in another tab/i);
    expect(conflictMessage).toBeInTheDocument();
    expect(conflictMessage).toHaveTextContent("Mod role ID");
    // The still-conflicting local edit keeps the save bar open.
    expect(screen.getByText(/careful.*unsaved changes/i)).toBeInTheDocument();

    otherTab.close();
  });

  it("Reset after a remote update loads the latest value, not the stale one from page load", async () => {
    render(<GeneralSettingsForm guildId="g1" settings={makeSettings()} />);

    const otherTab = guildChannel("g1");
    otherTab.postMessage({
      type: "settings-updated",
      settings: formState({ modRoleId: "999" }),
    });
    await waitFor(() =>
      expect(screen.getByLabelText("Mod role ID")).toHaveValue("999"),
    );

    // User edits an unrelated field, then hits Reset.
    fireEvent.change(screen.getByLabelText("Admin role ID"), {
      target: { value: "TEMP" },
    });
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    // Reset must land on the up-to-date baseline (999), not silently
    // revert the other tab's save back to the original page-load value.
    expect(screen.getByLabelText("Mod role ID")).toHaveValue("999");
    expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();

    otherTab.close();
  });

  it("broadcasts the saved settings on success so another open tab can pick them up", async () => {
    setGuildSettings.mockResolvedValue({ ok: true });
    render(<GeneralSettingsForm guildId="g1" settings={makeSettings()} />);

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
    // A tab that's already open and up to date answers any `request-sync`
    // with what it currently believes the baseline to be.
    const existingTab = guildChannel("g1");
    existingTab.onmessage = (event) => {
      if (event.data?.type === "request-sync") {
        existingTab.postMessage({
          type: "settings-updated",
          settings: formState({ prefix: "?" }),
        });
      }
    };

    render(<GeneralSettingsForm guildId="g1" settings={makeSettings()} />);

    await waitFor(() =>
      expect(screen.getByLabelText("Command prefix")).toHaveValue("?"),
    );

    existingTab.close();
  });
});
