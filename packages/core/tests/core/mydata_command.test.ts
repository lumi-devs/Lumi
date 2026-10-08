import { describe, it, expect, vi, beforeEach } from "bun:test";
import { CommandContext } from "#lib/command-context.js";
import { asHandler } from "#lib/commands/command-def.js";
import { mydataDef } from "#modules/core/commands/mydata.js";

vi.mock("#lib/module-system/Utility.js", () => ({
  getUtility: vi.fn(),
  tryGetUtility: vi.fn(),
}));

vi.mock("#lib/utilities/confirm.js", () => ({
  confirmPrompt: vi.fn().mockResolvedValue({ confirmed: true, message: {} }),
}));

vi.mock("#lib/gdpr.js", () => ({
  executeGdprExport: vi.fn(),
  executeGdprDeletion: vi.fn(),
}));

vi.mock("#lib/i18n/index.js", () => ({
  fetchT: vi.fn().mockResolvedValue((key: string) => key),
  fetchTyped: vi.fn().mockResolvedValue((key: string) => key),
}));

vi.mock("#lib/utilities/command-response.js", () => ({
  sendInteractionReply: vi.fn().mockResolvedValue(undefined),
}));

import { getUtility } from "#lib/module-system/Utility.js";
import { confirmPrompt } from "#lib/utilities/confirm.js";
import { executeGdprExport, executeGdprDeletion } from "#lib/gdpr.js";
import { sendInteractionReply } from "#lib/utilities/command-response.js";

function makeServices() {
  return {
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    moduleStore: { getRecord: vi.fn().mockReturnValue(undefined) },
  } as any;
}

function slashCtx(services: any) {
  const interaction = {
    user: { id: "123456789", tag: "testuser#0001" },
    guildId: "g-1",
    deferred: false,
    replied: false,
    deferReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    options: { getString: vi.fn().mockReturnValue(null) },
  } as any;
  return { ctx: CommandContext.fromInteraction(interaction, services), interaction };
}

function runHandler(name: "whatdata" | "3rdparty" | "getmydata" | "forgetme", ctx: CommandContext) {
  return asHandler(mydataDef.handlers![name]!).run(ctx);
}

function lastCardJson() {
  const calls = (sendInteractionReply as any).mock.calls;
  return JSON.stringify(calls[calls.length - 1][1]);
}

describe("mydataDef", () => {
  let services: any;
  let downloader: any;

  beforeEach(() => {
    vi.clearAllMocks();
    services = makeServices();
    downloader = { getInstalledModules: vi.fn().mockResolvedValue([]) };
    (getUtility as any).mockReturnValue(downloader);
    (confirmPrompt as any).mockResolvedValue({ confirmed: true, message: {} });
  });

  describe("whatdata", () => {
    it("replies with privacy information card", async () => {
      const { ctx } = slashCtx(services);

      await runHandler("whatdata", ctx);

      expect(lastCardJson()).toContain("End-User Data & Privacy in Lumi");
      expect(lastCardJson()).toContain("Right to Erasure");
    });
  });

  describe("3rdparty", () => {
    it("reports when no 3rd party addons are installed", async () => {
      const { ctx } = slashCtx(services);

      await runHandler("3rdparty", ctx);

      expect(lastCardJson()).toContain("does not have any third-party addons installed");
    });

    it("lists 3rd party addons and privacy statements when installed", async () => {
      downloader.getInstalledModules.mockResolvedValue([
        { moduleName: "economy" },
      ]);
      services.moduleStore.getRecord.mockReturnValue({
        meta: {
          name: "economy",
          displayName: "Economy",
          emoji: "💰",
          endUserDataStatement: "Stores user balance and inventory.",
        },
      });
      const { ctx } = slashCtx(services);

      await runHandler("3rdparty", ctx);

      expect(lastCardJson()).toContain("Stores user balance and inventory.");
    });
  });

  describe("getmydata", () => {
    it("exports user data and attaches a json file", async () => {
      (executeGdprExport as any).mockResolvedValue({ core: { blocklisted: false } });
      const { ctx, interaction } = slashCtx(services);

      await runHandler("getmydata", ctx);

      expect(executeGdprExport).toHaveBeenCalledWith(services, "123456789");
      const payload = interaction.reply.mock.calls[0][0];
      expect(payload.files).toHaveLength(1);
      expect(payload.files[0].name).toBe("lumi-user-data-123456789.json");
    });
  });

  describe("forgetme", () => {
    it("cancels deletion when the user denies the prompt", async () => {
      (confirmPrompt as any).mockResolvedValue({ confirmed: false, message: {} });
      const { ctx } = slashCtx(services);

      await runHandler("forgetme", ctx);

      expect(executeGdprDeletion).not.toHaveBeenCalled();
      expect(lastCardJson()).toContain("Cancelled");
    });

    it("executes deletion when the user confirms the prompt", async () => {
      (executeGdprDeletion as any).mockResolvedValue({ failedModules: [] });
      const { ctx } = slashCtx(services);

      await runHandler("forgetme", ctx);

      expect(executeGdprDeletion).toHaveBeenCalledWith(services, "123456789", "testuser#0001");
      expect(lastCardJson()).toContain("Data Deleted");
    });
  });
});
