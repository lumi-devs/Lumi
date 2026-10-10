import { describe, it, expect, vi, beforeEach } from "bun:test";
import tempvcVoiceStateUpdate from "@lumi/modules/tempvc/listeners/voiceStateUpdate.js";

vi.mock("@lumi/lib/module-system/utility.js", () => ({
  getUtility: vi.fn(),
  tryGetUtility: vi.fn(),
}));

vi.mock("@lumi/application/services/tempvc/registry.js", () => ({
  tempVcRegistry: {
    isManagedVc: vi.fn(),
    getGenerator: vi.fn(),
  },
}));

vi.mock("@lumi/application/services/tempvc/voice-occupancy.js", () => ({
  trackVoiceState: vi.fn(),
  isVoiceChannelEmpty: vi.fn(),
}));

import { getUtility } from "@lumi/lib/module-system/utility.js";
import { tempVcRegistry } from "@lumi/application/services/tempvc/registry.js";
import {
  trackVoiceState,
  isVoiceChannelEmpty,
} from "@lumi/application/services/tempvc/voice-occupancy.js";

function makeServices() {
  return {
    logger: { warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() },
    db: { modules: { isModuleEnabled: vi.fn().mockResolvedValue(true) } },
  } as any;
}

function makeMember(bot: boolean) {
  return {
    id: "user-1",
    user: { bot },
    voice: { disconnect: vi.fn().mockResolvedValue(undefined) },
    send: vi.fn().mockResolvedValue(undefined),
  } as any;
}

function makeState(overrides: Record<string, any> = {}) {
  return {
    channelId: null,
    member: makeMember(false),
    guild: { id: "g1", channels: { fetch: vi.fn() } },
    channel: null,
    ...overrides,
  } as any;
}

describe("tempvcVoiceStateUpdate", () => {
  let tempvc: any;

  beforeEach(() => {
    vi.clearAllMocks();
    tempvc = {
      scheduleCleanup: vi.fn().mockResolvedValue(undefined),
      onCreateCooldown: vi.fn().mockResolvedValue(false),
      createVc: vi.fn().mockResolvedValue(undefined),
    };
    (getUtility as any).mockReturnValue(tempvc);
    (tempVcRegistry.isManagedVc as any).mockResolvedValue(false);
    (tempVcRegistry.getGenerator as any).mockResolvedValue(null);
    (trackVoiceState as any).mockResolvedValue({ prevChannelId: null });
    (isVoiceChannelEmpty as any).mockResolvedValue(false);
  });

  it("ignores bot members", async () => {
    const services = makeServices();
    const oldState = makeState();
    const newState = makeState({ channelId: "gen-1", member: makeMember(true) });

    await tempvcVoiceStateUpdate.execute(services, oldState, newState);

    expect(tempVcRegistry.isManagedVc).not.toHaveBeenCalled();
  });

  it("ignores updates that do not change channel", async () => {
    const services = makeServices();
    const oldState = makeState({ channelId: "vc-1" });
    const newState = makeState({ channelId: "vc-1" });

    await tempvcVoiceStateUpdate.execute(services, oldState, newState);

    expect(tempVcRegistry.isManagedVc).not.toHaveBeenCalled();
  });

  it("ignores channels that are neither managed VCs nor generators", async () => {
    const services = makeServices();
    const oldState = makeState();
    const newState = makeState({ channelId: "random-1" });

    await tempvcVoiceStateUpdate.execute(services, oldState, newState);

    expect(trackVoiceState).not.toHaveBeenCalled();
    expect(tempvc.scheduleCleanup).not.toHaveBeenCalled();
    expect(tempvc.createVc).not.toHaveBeenCalled();
  });

  it("schedules cleanup when leaving a managed VC that is now empty", async () => {
    const services = makeServices();
    (tempVcRegistry.isManagedVc as any).mockImplementation(
      async (_g: string, c: string) => c === "vc-9",
    );
    (trackVoiceState as any).mockResolvedValue({ prevChannelId: "vc-9" });
    (isVoiceChannelEmpty as any).mockResolvedValue(true);
    const oldState = makeState({ channelId: "vc-9" });
    const newState = makeState({ channelId: null });

    await tempvcVoiceStateUpdate.execute(services, oldState, newState);

    expect(tempvc.scheduleCleanup).toHaveBeenCalledWith("g1", "vc-9");
  });

  it("creates a VC when joining a generator channel", async () => {
    const services = makeServices();
    const generator = { name: "Gaming {}", limit: 0 };
    (tempVcRegistry.getGenerator as any).mockResolvedValue(generator);
    const voiceChannel = { id: "gen-1", isVoiceBased: () => true };
    const member = makeMember(false);
    const oldState = makeState();
    const newState = makeState({ channelId: "gen-1", member, channel: voiceChannel });

    await tempvcVoiceStateUpdate.execute(services, oldState, newState);

    expect(tempvc.createVc).toHaveBeenCalledWith(services, member, voiceChannel, generator);
  });
});
