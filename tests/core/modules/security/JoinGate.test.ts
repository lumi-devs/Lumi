import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "#src/lib/Services.js";
import {
  applyGateAction,
  loadJoinGateConfig,
  evaluateJoinFilters,
} from "#src/modules/security/services/JoinGate.js";
import { QuarantineAction } from "#src/lib/api/moderation/Quarantine.js";
import { logToChannel } from "#src/lib/api/moderation/ModLog.js";

vi.mock("#lib/api/moderation/Quarantine.js", () => ({
  QuarantineAction: { apply: vi.fn() },
}));

vi.mock("#lib/api/moderation/ModLog.js", () => ({
  logToChannel: vi.fn(),
}));

function makeGateGuild(fetch: (id: string) => Promise<unknown>) {
  return { id: "g1", members: { fetch } } as any;
}

function makeGateConfig(filterAdvertising: { enabled: boolean; action: "kick" }) {
  return {
    enabled: true,
    raidJoinCount: 10,
    raidWindowSeconds: 30,
    raidAction: "kick" as const,
    raidAccountType: "all" as const,
    raidWarnRoleIds: [],
    filterNoAvatar: { enabled: false, action: "log" as const },
    filterMinAge: { enabled: false, hours: 0, action: "kick" as const },
    filterUnverifiedBot: { enabled: false, action: "kick" as const },
    filterUsernamePattern: { enabled: false, patterns: [], action: "log" as const },
    filterAdvertising,
  };
}

function setContainer(overrides: {
  valkey?: Record<string, unknown>;
  db?: Record<string, unknown>;
}) {
  (container as any).valkey = {
    incr: vi.fn(),
    expire: vi.fn(),
    set: vi.fn(),
    exists: vi.fn().mockResolvedValue(0),
    multi: vi.fn(),
    ...overrides.valkey,
  };
  (container as any).db = {
    config: { getModuleConfig: vi.fn().mockResolvedValue(null) },
    ...overrides.db,
  };
  (container as any).logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
}

beforeEach(() => {
  vi.clearAllMocks();
  (container as any).client = { user: { id: "bot-1" } };
  (container as any).db = {
    config: { getModuleConfig: vi.fn().mockResolvedValue(null) },
  };
});

describe("applyGateAction", () => {
  it("kicks, files a case, and logs", async () => {
    const kick = vi.fn().mockResolvedValue(undefined);
    const member = { id: "u1", kick };
    const fetch = vi.fn().mockResolvedValue(member);
    const createModerationCase = vi.fn().mockResolvedValue({ caseNumber: 9 });
    const gateGuild = makeGateGuild(fetch);

    setContainer({
      db: { moderation: { createModerationCase } },
    });

    const result = await applyGateAction(
      gateGuild,
      "u1",
      "kick",
      "Underage account",
    );

    expect(kick).toHaveBeenCalledWith("Underage account");
    expect(createModerationCase).toHaveBeenCalledWith(
      expect.objectContaining({ guildId: "g1", userId: "u1", action: "kick" }),
    );
    expect(logToChannel).toHaveBeenCalledWith(
      container,
      "g1",
      expect.any(String),
      expect.any(Number),
      "u1",
      expect.anything(),
      "Underage account",
      9,
      "security",
    );
    expect(result).toBe(true);
  });

  it("quarantines without filing a case", async () => {
    const member = { id: "u1" };
    const fetch = vi.fn().mockResolvedValue(member);
    const createModerationCase = vi.fn();
    const gateGuild = makeGateGuild(fetch);
    setContainer({
      db: { moderation: { createModerationCase } },
    });

    const result = await applyGateAction(
      gateGuild,
      "u1",
      "quarantine",
      "Raid join burst",
    );

    expect(QuarantineAction.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        guild: gateGuild,
        targetMember: member,
        reason: "Raid join burst",
      }),
    );
    expect(createModerationCase).not.toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it("returns false when the member already left", async () => {
    const fetch = vi.fn().mockResolvedValue(null);
    const gateGuild = makeGateGuild(fetch);
    setContainer({});

    const result = await applyGateAction(gateGuild, "u1", "kick", "Raid");

    expect(result).toBe(false);
  });
});

describe("advertising-account filter", () => {
  function makeMember(displayName: string) {
    return {
      user: { globalName: displayName, username: "fallback", bot: false, avatar: "x" },
    } as any;
  }

  it("parses the filter's enabled flag and action", async () => {
    const getAllModuleConfig = vi.fn().mockResolvedValue({
      filter_advertising_enabled: true,
      filter_advertising_action: "quarantine",
    });
    setContainer({ db: { config: { getAllModuleConfig } } });

    const config = await loadJoinGateConfig("g1");

    expect(config.filterAdvertising).toEqual({ enabled: true, action: "quarantine" });
  });

  it("trips on a link-as-display-name", () => {
    const config = makeGateConfig({ enabled: true, action: "kick" });

    const result = evaluateJoinFilters(makeMember("discord.gg/freenitro"), config);

    expect(result).toEqual({ action: "kick", triggered: ["advertising account"] });
  });

  it("stays quiet when disabled", () => {
    const config = makeGateConfig({ enabled: false, action: "kick" });

    const result = evaluateJoinFilters(makeMember("discord.gg/freenitro"), config);

    expect(result).toBeNull();
  });
});
