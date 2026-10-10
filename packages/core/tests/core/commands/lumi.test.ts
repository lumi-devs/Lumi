import { describe, it, expect, vi, beforeEach } from "bun:test";
import { CommandContext } from "@lumi/lib/commands/context.js";
import { asHandler } from "@lumi/lib/commands/command-def.js";
import { lumiDef } from "@lumi/modules/core/commands/lumi.js";

vi.mock("@lumi/modules/core/services/config-panel.js", () => ({
  loadFeatures: vi.fn().mockResolvedValue([]),
}));

vi.mock("@lumi/modules/core/ui/hub.js", () => ({
  buildHubView: vi.fn().mockReturnValue({ components: [] }),
}));

vi.mock("@lumi/lib/i18n/index.js", () => ({
  fetchT: vi.fn().mockResolvedValue((key: string) => key),
  fetchTyped: vi.fn().mockResolvedValue((key: string) => key),
}));

vi.mock("@lumi/lib/utilities/command-response.js", () => ({
  sendInteractionReply: vi.fn().mockResolvedValue(undefined),
}));

import { loadFeatures } from "@lumi/modules/core/services/config-panel.js";
import { buildHubView } from "@lumi/modules/core/ui/hub.js";

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

function runHandler(name: "panel", ctx: CommandContext) {
  return asHandler(lumiDef.handlers![name]!).run(ctx);
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
});
