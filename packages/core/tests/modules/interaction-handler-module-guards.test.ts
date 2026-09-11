import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@sapphire/framework";
import * as misc from "#lib/utilities/misc.js";

vi.mock("#lib/commands.js", () => ({
  fetchTyped: vi.fn().mockResolvedValue((key: string) => key),
}));

vi.mock("#lib/permissions/index.js", () => ({
  hasRequiredPermit: vi.fn().mockResolvedValue(true),
}));

vi.mock("#modules/utility/lib/media-utils.js", () => ({
  handleMediaRequest: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("#modules/afk/data/afk.js", () => ({
  getAfkMentions: vi.fn().mockResolvedValue([]),
}));

vi.mock("#modules/tempvc/panel-guard.js", () => ({
  resolveVc: vi.fn().mockResolvedValue(null),
  resolveOwnedVc: vi.fn().mockResolvedValue(null),
  resolveOwnedRecord: vi.fn().mockResolvedValue(null),
}));

function pieceContext(name: string) {
  return {
    name,
    path: `/virtual/${name}.ts`,
    root: "/virtual",
    store: { name: "interaction-handlers" } as any,
  };
}

describe("interaction handlers guard on per-guild module state", () => {
  let isModuleEnabled: ReturnType<typeof vi.spyOn<typeof misc, "isModuleEnabled">>;

  beforeEach(() => {
    vi.clearAllMocks();
    isModuleEnabled = vi.spyOn(misc, "isModuleEnabled");
    (container as any).logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    (container as any).permitResolver = { hasPermit: vi.fn().mockResolvedValue(true) };
    (container as any).db = {
      moderation: { resetWarnThresholds: vi.fn().mockResolvedValue(undefined) },
    };
  });

  it("security panic revert skips work when security is disabled", async () => {
    const { PanicRevertInteractionHandler } = await import(
      "#modules/security/interaction-handlers/panic.js"
    );
    const handler = new PanicRevertInteractionHandler(pieceContext("panic") as any);
    const interaction = {
      inGuild: () => true,
      guild: { id: "g-1", ownerId: "owner-1" },
      guildId: "g-1",
      user: { id: "u-1" },
      member: null,
      channelId: "c-1",
      deferUpdate: vi.fn().mockResolvedValue(undefined),
    };

    isModuleEnabled.mockResolvedValue(false);
    await handler.run(interaction as any);
    expect((container as any).permitResolver.hasPermit).not.toHaveBeenCalled();

    isModuleEnabled.mockResolvedValue(true);
    await expect(handler.run(interaction as any)).rejects.toThrow();
    expect((container as any).permitResolver.hasPermit).toHaveBeenCalled();
  });

  it("security verify skips work when security is disabled", async () => {
    const { VerifyInteractionHandler } = await import(
      "#modules/security/interaction-handlers/verify.js"
    );
    const handler = new VerifyInteractionHandler(pieceContext("verify") as any);
    const interaction = {
      inGuild: () => true,
      guild: { id: "g-1" },
      guildId: "g-1",
      user: { id: "u-1" },
      deferReply: vi.fn().mockResolvedValue(undefined),
      deferUpdate: vi.fn().mockResolvedValue(undefined),
    };

    isModuleEnabled.mockResolvedValue(false);
    await handler.run(interaction as any, { kind: "start" });
    expect(interaction.deferReply).not.toHaveBeenCalled();
  });

  it("utility media view skips work when utility is disabled", async () => {
    const { handleMediaRequest } = await import("#modules/utility/lib/media-utils.js");
    const mod = await import("#modules/utility/interaction-handlers/view.js");
    const HandlerClass = mod.default;
    const handler = new HandlerClass(pieceContext("view") as any);
    const interaction = {
      inGuild: () => true,
      guildId: "g-1",
      deferReply: vi.fn().mockResolvedValue(undefined),
      client: { users: { fetch: vi.fn() } },
    };

    isModuleEnabled.mockResolvedValue(false);
    await handler.run(interaction as any, { userId: "u-1", type: "avatar" });
    expect(handleMediaRequest).not.toHaveBeenCalled();
    expect(interaction.deferReply).not.toHaveBeenCalled();

    isModuleEnabled.mockResolvedValue(true);
    await handler.run(interaction as any, { userId: "u-1", type: "avatar" });
    expect(handleMediaRequest).toHaveBeenCalled();
  });

  it("afk mentions skips work when afk is disabled", async () => {
    const { getAfkMentions } = await import("#modules/afk/data/afk.js");
    const mod = await import("#modules/afk/interaction-handlers/mentions.js");
    const HandlerClass = mod.default;
    const handler = new HandlerClass(pieceContext("afk-mentions") as any);
    const interaction = {
      inGuild: () => true,
      guildId: "g-1",
      user: { id: "u-1" },
      message: { flags: { has: () => false } },
      deferReply: vi.fn().mockResolvedValue(undefined),
      deferUpdate: vi.fn().mockResolvedValue(undefined),
    };

    isModuleEnabled.mockResolvedValue(false);
    await handler.run(interaction as any, { userId: "u-1", page: 0 });
    expect(getAfkMentions).not.toHaveBeenCalled();
  });

  it("tempvc panel button skips work when tempvc is disabled", async () => {
    const { resolveOwnedVc } = await import("#modules/tempvc/panel-guard.js");
    const { TempVcPanelButtonHandler } = await import(
      "#modules/tempvc/interaction-handlers/tempvc-panel-button.js"
    );
    const handler = new TempVcPanelButtonHandler(pieceContext("tvc-btn") as any);
    const interaction = {
      inGuild: () => true,
      guildId: "g-1",
      guild: {},
      member: {},
      deferUpdate: vi.fn().mockResolvedValue(undefined),
    };

    isModuleEnabled.mockResolvedValue(false);
    await handler.run(interaction as any, { action: "panel", channelId: "c-1" });
    expect(resolveOwnedVc).not.toHaveBeenCalled();
  });

  it("tempvc panel modal skips work when tempvc is disabled", async () => {
    const { resolveOwnedVc } = await import("#modules/tempvc/panel-guard.js");
    const { TempVcPanelModalHandler } = await import(
      "#modules/tempvc/interaction-handlers/tempvc-panel-modal.js"
    );
    const handler = new TempVcPanelModalHandler(pieceContext("tvc-modal") as any);
    const interaction = {
      inGuild: () => true,
      guildId: "g-1",
      guild: {},
      member: {},
      deferUpdate: vi.fn().mockResolvedValue(undefined),
    };

    isModuleEnabled.mockResolvedValue(false);
    await handler.run(interaction as any, { kind: "namem", channelId: "c-1" });
    expect(resolveOwnedVc).not.toHaveBeenCalled();
  });

  it("tempvc panel select skips work when tempvc is disabled", async () => {
    const { resolveOwnedRecord } = await import("#modules/tempvc/panel-guard.js");
    const { TempVcPanelSelectHandler } = await import(
      "#modules/tempvc/interaction-handlers/tempvc-panel-select.js"
    );
    const handler = new TempVcPanelSelectHandler(pieceContext("tvc-select") as any);
    const interaction = {
      inGuild: () => true,
      guildId: "g-1",
      guild: { channels: { cache: new Map([["c-1", { isVoiceBased: () => true }]]) } },
      member: {},
      values: ["c-1"],
      deferUpdate: vi.fn().mockResolvedValue(undefined),
    };

    isModuleEnabled.mockResolvedValue(false);
    await handler.run(interaction as any, { action: "panelmenu", channelId: "c-1" });
    expect(resolveOwnedRecord).not.toHaveBeenCalled();
  });
});
