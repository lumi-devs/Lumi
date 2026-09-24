import { describe, it, expect, vi, beforeEach } from "bun:test";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { RpcInput } from "@lumi/contracts/rpc";
import type { GuildSettings } from "@lumi/contracts/views";
import { guildActionsMock } from "../setup";

const { setGuildSettings } = guildActionsMock;

const { GeneralSettingsForm } = await import(
  "#/components/guild/general-settings-form"
);

function baseValues() {
  return {
    prefix: "!",
    locale: "en-US",
  } as const;
}

function makeSettings(overrides: Partial<GuildSettings> = {}): GuildSettings {
  return { ...baseValues(), ...overrides };
}

function formState(
  overrides: Partial<RpcInput<"guild.settings.set">> = {},
): RpcInput<"guild.settings.set"> {
  return { ...baseValues(), ...overrides };
}

function guildChannel(guildId: string) {
  return new BroadcastChannel(`lumi:guild-settings:${guildId}`);
}

describe("GeneralSettingsForm (partial guild.settings.set save)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("on save, sends only the field(s) that actually changed", async () => {
    setGuildSettings.mockResolvedValue({ ok: true });
    render(<GeneralSettingsForm guildId="101" settings={makeSettings()} />);

    fireEvent.change(screen.getByLabelText("Command prefix"), {
      target: { value: "??" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(setGuildSettings).toHaveBeenCalledWith("101", { prefix: "??" }),
    );
    expect(setGuildSettings).toHaveBeenCalledTimes(1);
  });

  it("normalizes an emptied nullable prefix field to null, but only sends that one field", async () => {
    setGuildSettings.mockResolvedValue({ ok: true });
    render(<GeneralSettingsForm guildId="101" settings={makeSettings()} />);

    fireEvent.change(screen.getByLabelText("Command prefix"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(setGuildSettings).toHaveBeenCalledWith("101", { prefix: null }),
    );
    expect(setGuildSettings).toHaveBeenCalledTimes(1);
  });

  it("shows an error and keeps the save bar open when a save fails", async () => {
    setGuildSettings.mockResolvedValue({ ok: false, error: "Bad payload" });
    render(<GeneralSettingsForm guildId="101" settings={makeSettings()} />);

    fireEvent.change(screen.getByLabelText("Command prefix"), {
      target: { value: "??" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText("Bad payload")).toBeInTheDocument();
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
  });
});

describe("GeneralSettingsForm (cross-tab sync)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("hides the save bar until a field is edited", () => {
    render(<GeneralSettingsForm guildId="g1" settings={makeSettings()} />);
    expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();
  });

  // Locale is a fixed single-value enum (en-US only) until more locales land
  // via Crowdin, so it can't stand in as the "changing" field anymore — prefix
  // is the only field these generic dirty-tracking/merge tests can drive.
  it("adopts a remote settings-updated broadcast from another tab for untouched fields", async () => {
    render(<GeneralSettingsForm guildId="g1" settings={makeSettings()} />);
    expect(screen.getByLabelText("Command prefix")).toHaveValue("!");

    const otherTab = guildChannel("g1");
    otherTab.postMessage({
      type: "settings-updated",
      settings: formState({ prefix: "?!" }),
    });

    await waitFor(() =>
      expect(screen.getByLabelText("Command prefix")).toHaveValue("?!"),
    );
    expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();

    otherTab.close();
  });

  it("keeps a locally-edited, unsaved field on remote conflict and surfaces an error", async () => {
    render(<GeneralSettingsForm guildId="g1" settings={makeSettings()} />);

    fireEvent.change(screen.getByLabelText("Command prefix"), {
      target: { value: "LOCAL-EDIT" },
    });
    expect(screen.getByLabelText("Command prefix")).toHaveValue("LOCAL-EDIT");

    const otherTab = guildChannel("g1");
    otherTab.postMessage({
      type: "settings-updated",
      settings: formState({ prefix: "REMOTE-CHANGE" }),
    });

    await waitFor(() => {
      const conflictMessage = screen.getByText(/changed in another tab/i);
      expect(conflictMessage).toBeInTheDocument();
      expect(conflictMessage).toHaveTextContent("Command prefix");
    });
    expect(screen.getByLabelText("Command prefix")).toHaveValue("LOCAL-EDIT");
    expect(screen.getByText(/careful.*unsaved changes/i)).toBeInTheDocument();

    otherTab.close();
  });

  it("Reset after a remote update loads the latest value, not the stale one from page load", async () => {
    render(<GeneralSettingsForm guildId="g1" settings={makeSettings()} />);

    const otherTab = guildChannel("g1");
    otherTab.postMessage({
      type: "settings-updated",
      settings: formState({ prefix: "?!" }),
    });
    await waitFor(() =>
      expect(screen.getByLabelText("Command prefix")).toHaveValue("?!"),
    );

    fireEvent.change(screen.getByLabelText("Command prefix"), {
      target: { value: "??" },
    });
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() => {
      expect(screen.getByLabelText("Command prefix")).toHaveValue("?!");
      expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();
    });

    otherTab.close();
  });

  it("broadcasts the saved settings on success so another open tab can pick them up", async () => {
    setGuildSettings.mockResolvedValue({ ok: true });
    render(<GeneralSettingsForm guildId="g1" settings={makeSettings()} />);

    const otherTab = guildChannel("g1");
    const updates: RpcInput<"guild.settings.set">[] = [];
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

    render(<GeneralSettingsForm guildId="g1" settings={makeSettings()} />);

    await waitFor(() =>
      expect(screen.getByLabelText("Command prefix")).toHaveValue("?"),
    );

    existingTab.close();
  });
});

describe("GeneralSettingsForm (locale)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the current locale and offers only the supported locales", () => {
    render(<GeneralSettingsForm guildId="101" settings={makeSettings()} />);

    const localeField = screen.getByLabelText("Locale");
    expect(localeField).toHaveTextContent("en-US");

    fireEvent.click(localeField);
    expect(screen.getByRole("option", { name: "en-US" })).toBeInTheDocument();
    expect(screen.queryAllByRole("option")).toHaveLength(1);
  });

  it("falls back to en-US when the guild's stored locale isn't a supported one", () => {
    render(
      <GeneralSettingsForm
        guildId="101"
        settings={makeSettings({ locale: "xx-YY" })}
      />,
    );

    expect(screen.getByLabelText("Locale")).toHaveTextContent("en-US");
  });
});
