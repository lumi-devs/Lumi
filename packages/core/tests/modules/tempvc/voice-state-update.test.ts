import { describe, it, expect, vi, beforeEach } from "bun:test";
import TempVcVoiceStateListener from "#modules/tempvc/listeners/voiceStateUpdate.js";
import { tempVcRegistry } from "#modules/tempvc/services/registry.js";
import { trackVoiceState } from "#modules/tempvc/services/voice-occupancy.js";

vi.mock("#modules/tempvc/services/registry.js", () => ({
  tempVcRegistry: {
    isManagedVc: vi.fn().mockResolvedValue(false),
    getGenerator: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("#modules/tempvc/services/voice-occupancy.js", () => ({
  trackVoiceState: vi.fn().mockResolvedValue({ prevChannelId: null }),
  isVoiceChannelEmpty: vi.fn().mockResolvedValue(false),
}));

function makeVoiceState(overrides: Record<string, unknown> = {}) {
  return {
    channelId: null,
    guild: { id: "guild-1" },
    member: { id: "user-1", user: { bot: false } },
    ...overrides,
  };
}

describe("tempvc TempVcVoiceStateListener", () => {
  let listener: TempVcVoiceStateListener;

  beforeEach(() => {
    vi.clearAllMocks();
    (tempVcRegistry.isManagedVc as any).mockResolvedValue(false);
    (tempVcRegistry.getGenerator as any).mockResolvedValue(null);

    listener = new TempVcVoiceStateListener(
      {
        name: "tempvcVoiceStateUpdate",
        path: "/path/to/modules/tempvc/listeners/voiceStateUpdate.ts",
        root: "/path/to/modules",
        store: { name: "listeners" } as any,
      },
      { event: "voiceStateUpdate" },
    );
  });

  it("skips trackVoiceState when neither the old nor the new channel is temp-vc-relevant", async () => {
    const oldState = makeVoiceState({ channelId: "vc-old" });
    const newState = makeVoiceState({ channelId: "vc-new" });

    await listener.run(oldState as any, newState as any);

    expect(tempVcRegistry.isManagedVc).toHaveBeenCalledWith("guild-1", "vc-old");
    expect(tempVcRegistry.isManagedVc).toHaveBeenCalledWith("guild-1", "vc-new");
    expect(tempVcRegistry.getGenerator).toHaveBeenCalledWith("guild-1", "vc-new");
    expect(trackVoiceState).not.toHaveBeenCalled();
  });

  it("tracks the move when the old channel is a managed temp VC", async () => {
    (tempVcRegistry.isManagedVc as any).mockImplementation(
      (_guildId: string, channelId: string) => Promise.resolve(channelId === "vc-old"),
    );
    const oldState = makeVoiceState({ channelId: "vc-old" });
    const newState = makeVoiceState({ channelId: "vc-new" });

    await listener.run(oldState as any, newState as any);

    expect(trackVoiceState).toHaveBeenCalledWith("user-1", "vc-new");
  });

  it("tracks the move when the new channel is a managed temp VC", async () => {
    (tempVcRegistry.isManagedVc as any).mockImplementation(
      (_guildId: string, channelId: string) => Promise.resolve(channelId === "vc-new"),
    );
    const oldState = makeVoiceState({ channelId: "vc-old" });
    const newState = makeVoiceState({ channelId: "vc-new" });

    await listener.run(oldState as any, newState as any);

    expect(trackVoiceState).toHaveBeenCalledWith("user-1", "vc-new");
  });

  it("still skips for bots without touching the registry", async () => {
    const oldState = makeVoiceState({ channelId: "vc-old" });
    const newState = makeVoiceState({
      channelId: "vc-new",
      member: { id: "bot-1", user: { bot: true } },
    });

    await listener.run(oldState as any, newState as any);

    expect(tempVcRegistry.isManagedVc).not.toHaveBeenCalled();
    expect(trackVoiceState).not.toHaveBeenCalled();
  });
});
