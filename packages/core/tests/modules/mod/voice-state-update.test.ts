import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@sapphire/framework";
import * as misc from "#lib/utilities/misc.js";
import { VoiceStateUpdateListener } from "#modules/mod/listeners/voiceStateUpdate.js";

function makeVoiceState(overrides: Record<string, unknown> = {}) {
  return {
    channelId: "vc-1",
    mute: false,
    serverMute: false,
    guild: { id: "guild-1" },
    member: { id: "user-1" },
    disconnect: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("mod VoiceStateUpdateListener", () => {
  let listener: VoiceStateUpdateListener;
  let isModuleEnabled: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    isModuleEnabled = vi.spyOn(misc, "isModuleEnabled").mockResolvedValue(true);
    (container as any).db = {
      moderation: {
        isVoiceMuted: vi.fn().mockResolvedValue(false),
      },
    };

    listener = new VoiceStateUpdateListener(
      {
        name: "modVoiceStateUpdate",
        path: "/path/to/modules/mod/listeners/voiceStateUpdate.ts",
        root: "/path/to/modules",
        store: { name: "listeners" } as any,
      },
      { module: "mod", event: "voiceStateUpdate" },
    );
  });

  it("does nothing when the mod module is disabled for the guild", async () => {
    isModuleEnabled.mockResolvedValue(false);
    const oldState = makeVoiceState({ channelId: null });
    const newState = makeVoiceState();

    await listener.run(oldState as any, newState as any);

    expect(container.db.moderation.isVoiceMuted).not.toHaveBeenCalled();
    expect(newState.disconnect).not.toHaveBeenCalled();
  });

  it("skips an irrelevant change (self-deafen toggle within the same channel)", async () => {
    const oldState = makeVoiceState({ selfDeaf: false });
    const newState = makeVoiceState({ selfDeaf: true });

    await listener.run(oldState as any, newState as any);

    expect(container.db.moderation.isVoiceMuted).not.toHaveBeenCalled();
    expect(newState.disconnect).not.toHaveBeenCalled();
  });

  it("checks and disconnects on a channel join for a voice-muted user", async () => {
    (container.db.moderation.isVoiceMuted as any).mockResolvedValue(true);
    const oldState = makeVoiceState({ channelId: null });
    const newState = makeVoiceState();

    await listener.run(oldState as any, newState as any);

    expect(container.db.moderation.isVoiceMuted).toHaveBeenCalledWith("guild-1", "user-1");
    expect(newState.disconnect).toHaveBeenCalled();
  });

  it("re-evaluates when the mute flags are toggled by someone else", async () => {
    (container.db.moderation.isVoiceMuted as any).mockResolvedValue(true);
    const oldState = makeVoiceState({ serverMute: false });
    const newState = makeVoiceState({ serverMute: true });

    await listener.run(oldState as any, newState as any);

    expect(container.db.moderation.isVoiceMuted).toHaveBeenCalledWith("guild-1", "user-1");
    expect(newState.disconnect).toHaveBeenCalled();
  });
});
