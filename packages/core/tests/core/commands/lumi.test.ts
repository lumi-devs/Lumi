import { describe, it, expect, vi, beforeEach } from "bun:test";
import { CommandContext } from "#lib/commands/context.js";
import { asHandler } from "#lib/commands/command-def.js";
import { lumiDef } from "#modules/core/commands/lumi.js";
import { UserError } from "@lumi/shared";

vi.mock("#modules/core/services/config-panel.js", () => ({
  loadFeatures: vi.fn().mockResolvedValue([]),
}));

vi.mock("#lib/utilities/self-update.js", () => ({
  updateLumiCore: vi.fn(),
}));

vi.mock("#modules/core/ui/hub.js", () => ({
  buildHubView: vi.fn().mockReturnValue({ components: [] }),
}));

vi.mock("#lib/i18n/index.js", () => ({
  fetchT: vi.fn().mockResolvedValue((key: string) => key),
  fetchTyped: vi.fn().mockResolvedValue((key: string) => key),
}));

vi.mock("#lib/utilities/command-response.js", () => ({
  sendInteractionReply: vi.fn().mockResolvedValue(undefined),
}));

import { loadFeatures } from "#modules/core/services/config-panel.js";
import { updateLumiCore } from "#lib/utilities/self-update.js";
import { PermitResolver } from "#lib/permissions/PermitResolver.js";
import { buildHubView } from "#modules/core/ui/hub.js";
import { sendInteractionReply } from "#lib/utilities/command-response.js";

function makeServices() {
  return {
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    db: {
      config: {
        getGuildSettings: vi.fn().mockResolvedValue({ prefix: "!", locale: "en-US" }),
      },
    },
    client: {
      guilds: { cache: new Map() },
      user: { displayAvatarURL: () => "https://cdn/bot.png" },
    },
  } as any;
}

function slashCtx(services: any) {
  const interaction = {
    user: { id: "u-1", tag: "Tester#0001" },
    guildId: "g-1",
    deferred: false,
    replied: false,
    deferReply: vi.fn().mockResolvedValue(undefined),
    options: { getString: vi.fn().mockReturnValue(null) },
  } as any;
  return CommandContext.fromInteraction(interaction, services);
}

function runHandler(name: "panel" | "update", ctx: CommandContext) {
  return asHandler(lumiDef.handlers![name]!).run(ctx);
}

function lastCardJson() {
  const calls = (sendInteractionReply as any).mock.calls;
  return JSON.stringify(calls[calls.length - 1][1]);
}

describe("lumiDef", () => {
  let services: any;

  beforeEach(() => {
    vi.clearAllMocks();
    services = makeServices();
  });

  describe("panel", () => {
    it("counts only guild-enabled modules against the discovered total", async () => {
      (loadFeatures as any).mockResolvedValue([
        { guildEnabled: true },
        { guildEnabled: false },
        { guildEnabled: true },
      ]);

      await runHandler("panel", slashCtx(services));

      expect(loadFeatures).toHaveBeenCalledWith(services, "g-1");
      expect(buildHubView).toHaveBeenCalledWith(
        expect.objectContaining({ moduleCount: 3, enabledCount: 2 }),
        expect.anything(),
      );
    });

    it("passes the guild's configured prefix and locale into the panel", async () => {
      await runHandler("panel", slashCtx(services));

      expect(services.db.config.getGuildSettings).toHaveBeenCalledWith("g-1");
      expect(buildHubView).toHaveBeenCalledWith(
        expect.objectContaining({ prefix: "!", locale: "en-US" }),
        expect.anything(),
      );
    });

    it("prefers the guild icon when the guild is cached, else the bot avatar", async () => {
      await runHandler("panel", slashCtx(services));
      expect(buildHubView).toHaveBeenCalledWith(
        expect.objectContaining({ iconUrl: "https://cdn/bot.png" }),
        expect.anything(),
      );

      vi.clearAllMocks();
      services.client.guilds.cache = new Map([
        ["g-1", { iconURL: () => "https://cdn/guild.png" }],
      ]);
      await runHandler("panel", slashCtx(services));
      expect(buildHubView).toHaveBeenCalledWith(
        expect.objectContaining({ iconUrl: "https://cdn/guild.png" }),
        expect.anything(),
      );
    });
  });

  describe("update", () => {
    beforeEach(() => {
      vi.spyOn(PermitResolver, "isBotOwner").mockReturnValue(true);
    });

    it("refuses a non bot owner before running the updater", async () => {
      (PermitResolver.isBotOwner as any).mockReturnValue(false);

      await expect(runHandler("update", slashCtx(services))).rejects.toThrow(UserError);
      expect(updateLumiCore).not.toHaveBeenCalled();
    });

    it("surfaces the updater error without claiming success", async () => {
      (updateLumiCore as any).mockResolvedValue({ error: "working tree is dirty" });

      await runHandler("update", slashCtx(services));

      expect(lastCardJson()).toContain("working tree is dirty");
    });

    it("offers a restart choice after a successful update", async () => {
      (updateLumiCore as any).mockResolvedValue({
        updated: true,
        commitsCount: 3,
        latestCommit: "def5678",
        currentCommit: "abc1234",
        changelog: "- fix things",
      });

      await runHandler("update", slashCtx(services));

      expect(lastCardJson()).toContain("module:restart:u-1");
    });

    it("reports an already-current install without offering a restart", async () => {
      (updateLumiCore as any).mockResolvedValue({ updated: false, currentCommit: "abc1234" });

      await runHandler("update", slashCtx(services));

      expect(lastCardJson()).toContain("core:coreUpToDateTitle");
      expect(lastCardJson()).not.toContain("module:restart:");
    });
  });
});
