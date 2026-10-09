import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "#lib/services.js";
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
  beforeEach(() => {
    vi.clearAllMocks();
    (container as any).db = {
      moderation: {
        isVoiceMuted: vi.fn().mockResolvedValue(false),
      },
    };
  });

  it("is gated on the mod module with voice-state guild resolution", () => {
    expect(VoiceStateUpdateListener.module).toBe("mod");
    const oldState = makeVoiceState({ channelId: null });
    const newState = makeVoiceState();
    expect(
      VoiceStateUpdateListener.guildId?.(oldState as any, newState as any),
    ).toBe("guild-1");
  });

  it("skips an irrelevant change (self-deafen toggle within the same channel)", async () => {
    const oldState = makeVoiceState({ selfDeaf: false });
    const newState = makeVoiceState({ selfDeaf: true });

    await VoiceStateUpdateListener.execute(container, oldState as any, newState as any);

    expect(container.db.moderation.isVoiceMuted).not.toHaveBeenCalled();
    expect(newState.disconnect).not.toHaveBeenCalled();
  });

  it("checks and disconnects on a channel join for a voice-muted user", async () => {
    (container.db.moderation.isVoiceMuted as any).mockResolvedValue(true);
    const oldState = makeVoiceState({ channelId: null });
    const newState = makeVoiceState();

    await VoiceStateUpdateListener.execute(container, oldState as any, newState as any);

    expect(container.db.moderation.isVoiceMuted).toHaveBeenCalledWith("guild-1", "user-1");
    expect(newState.disconnect).toHaveBeenCalled();
  });

  it("re-evaluates when the mute flags are toggled by someone else", async () => {
    (container.db.moderation.isVoiceMuted as any).mockResolvedValue(true);
    const oldState = makeVoiceState({ serverMute: false });
    const newState = makeVoiceState({ serverMute: true });

    await VoiceStateUpdateListener.execute(container, oldState as any, newState as any);

    expect(container.db.moderation.isVoiceMuted).toHaveBeenCalledWith("guild-1", "user-1");
    expect(newState.disconnect).toHaveBeenCalled();
  });
});
