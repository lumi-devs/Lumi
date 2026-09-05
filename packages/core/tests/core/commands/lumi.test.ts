import { describe, it, expect, vi, beforeEach } from "vitest";
import { container, UserError } from "@sapphire/framework";
import { LumiCommand } from "#modules/core/commands/lumi.js";

vi.mock("#modules/core/lib/config-panel.js", () => ({
  loadFeatures: vi.fn().mockResolvedValue([]),
}));

vi.mock("#utilities/self-update.js", () => ({
  updateLumiCore: vi.fn(),
}));

vi.mock("#modules/core/ui/hub.js", () => ({
  buildHubView: vi.fn().mockReturnValue({ components: [] }),
}));

import { loadFeatures } from "#modules/core/lib/config-panel.js";
import { updateLumiCore } from "#utilities/self-update.js";
import { PermitResolver } from "#lib/permissions/PermitResolver.js";
import { buildHubView } from "#modules/core/ui/hub.js";

function cardText(card: any): string {
  return JSON.stringify(card.components[0].toJSON());
}

describe("LumiCommand", () => {
  let command: LumiCommand;

  beforeEach(() => {
    vi.clearAllMocks();

    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;

    (container as any).db = {
      config: {
        getGuildSettings: vi
          .fn()
          .mockResolvedValue({ prefix: "!", locale: "en-US" }),
      },
    };

    (container as any).client = {
      options: {},
      guilds: { cache: new Map() },
      user: { displayAvatarURL: () => "https://cdn/bot.png" },
    };

    command = new LumiCommand(
      {
        name: "lumi",
        path: "/path/to/commands/lumi.ts",
        root: "/path/to/commands",
        store: { name: "commands" } as any,
      },
      { prefixEnabled: true },
    );
  });

  function createMockCtx() {
    return {
      isSlash: false,
      guildId: "g-1",
      user: { id: "u-1", tag: "Tester#0001" },
      source: {},
      fetchT: vi.fn().mockResolvedValue((key: string) => key),
      reply: vi.fn().mockResolvedValue(undefined),
      replyInfo: vi.fn().mockResolvedValue(undefined),
      replySuccess: vi.fn().mockResolvedValue(undefined),
      replyError: vi.fn().mockResolvedValue(undefined),
      checkPermit: vi.fn().mockResolvedValue(undefined),
    };
  }

  describe("panel", () => {
    it("counts only guild-enabled modules against the discovered total", async () => {
      (loadFeatures as any).mockResolvedValue([
        { guildEnabled: true },
        { guildEnabled: false },
        { guildEnabled: true },
      ]);
      const ctx = createMockCtx();

      await command.panel(ctx as any);

      expect(loadFeatures).toHaveBeenCalledWith("g-1");
      expect(buildHubView).toHaveBeenCalledWith(
        expect.objectContaining({ moduleCount: 3, enabledCount: 2 }),
        expect.anything(),
      );
    });

    it("passes the guild's configured prefix and locale into the panel", async () => {
      const ctx = createMockCtx();

      await command.panel(ctx as any);

      expect(container.db.config.getGuildSettings).toHaveBeenCalledWith("g-1");
      expect(buildHubView).toHaveBeenCalledWith(
        expect.objectContaining({ prefix: "!", locale: "en-US" }),
        expect.anything(),
      );
    });

    it("falls back to the bot avatar when the guild is not cached", async () => {
      const ctx = createMockCtx();

      await command.panel(ctx as any);

      expect(buildHubView).toHaveBeenCalledWith(
        expect.objectContaining({ iconUrl: "https://cdn/bot.png" }),
        expect.anything(),
      );
    });

    it("prefers the guild icon when the guild is cached", async () => {
      (container as any).client.guilds.cache = new Map([
        ["g-1", { iconURL: () => "https://cdn/guild.png" }],
      ]);
      const ctx = createMockCtx();

      await command.panel(ctx as any);

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
      const ctx = createMockCtx();

      await expect(command.update(ctx as any)).rejects.toThrow(UserError);

      expect(updateLumiCore).not.toHaveBeenCalled();
    });

    it("surfaces the updater error without claiming success", async () => {
      (updateLumiCore as any).mockResolvedValue({
        error: "working tree is dirty",
      });
      const ctx = createMockCtx();

      await command.update(ctx as any);

      expect(ctx.replyError).toHaveBeenCalledWith(
        expect.any(String),
        "working tree is dirty",
      );
      expect(ctx.replySuccess).not.toHaveBeenCalled();
    });

    it("offers a restart choice after a successful update", async () => {
      (updateLumiCore as any).mockResolvedValue({
        updated: true,
        commitsCount: 3,
        latestCommit: "def5678",
        currentCommit: "abc1234",
        changelog: "- fix things",
      });
      const ctx = createMockCtx();

      await command.update(ctx as any);

      const card = ctx.reply.mock.calls.at(-1)![0];
      expect(cardText(card)).toContain("module:restart:u-1");
      expect(ctx.replyError).not.toHaveBeenCalled();
    });

    it("reports an already-current install without offering a restart", async () => {
      (updateLumiCore as any).mockResolvedValue({
        updated: false,
        currentCommit: "abc1234",
      });
      const ctx = createMockCtx();

      await command.update(ctx as any);

      expect(ctx.replySuccess).toHaveBeenCalled();
      const restartOffered = ctx.reply.mock.calls.some((call: any[]) =>
        cardText(call[0]).includes("module:restart:"),
      );
      expect(restartOffered).toBe(false);
    });
  });
});
