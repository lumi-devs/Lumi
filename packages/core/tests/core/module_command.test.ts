import { describe, it, expect, vi, beforeEach } from "bun:test";
import { CommandContext } from "@lumi/lib/commands/context.js";
import { asHandler } from "@lumi/lib/commands/command-def.js";
import { moduleDef } from "@lumi/modules/core/commands/module.js";

vi.mock("@lumi/lib/module-system/utility.js", () => ({
  getUtility: vi.fn(),
  tryGetUtility: vi.fn(),
}));

vi.mock("@lumi/lib/i18n/index.js", () => ({
  fetchT: vi.fn().mockResolvedValue((key: string) => key),
  fetchTyped: vi.fn().mockResolvedValue((key: string) => key),
}));

vi.mock("@lumi/lib/utilities/command-response.js", () => ({
  sendInteractionReply: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@lumi/lib/utilities/pagination.js", () => ({
  paginateContainer: vi.fn().mockResolvedValue(undefined),
  paginateList: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@lumi/application/services/core/module-command/operations.js", () => ({
  installModule: vi.fn(),
  pinModule: vi.fn(),
  reloadModule: vi.fn(),
  setModuleEnabled: vi.fn(),
  uninstallModule: vi.fn(),
  unpinModule: vi.fn(),
  updateAllModules: vi.fn(),
  updateModule: vi.fn(),
}));

vi.mock("@lumi/application/services/core/module-command/pieces.js", () => ({
  getModulePiecesInfo: vi.fn().mockResolvedValue({ totalPieces: 0, piecesByStore: {} }),
}));

import { getUtility } from "@lumi/lib/module-system/utility.js";
import { sendInteractionReply } from "@lumi/lib/utilities/command-response.js";
import { paginateList } from "@lumi/lib/utilities/pagination.js";
import { setModuleEnabled } from "@lumi/application/services/core/module-command/operations.js";

function makeServices(records: any[] = []) {
  return {
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    moduleStore: {
      all: vi.fn().mockReturnValue(records),
      getRecord: vi.fn().mockImplementation((name: string) => records.find((r) => r.name === name)),
    },
  } as any;
}

function slashCtx(options: Record<string, unknown>, services: any) {
  const interaction = {
    user: { id: "u-1", tag: "Tester#0001" },
    guildId: "g-1",
    deferred: false,
    replied: false,
    deferReply: vi.fn().mockResolvedValue(undefined),
    options: {
      getString: vi.fn().mockImplementation((name: string) => options[name] ?? null),
    },
  } as any;
  return CommandContext.fromInteraction(interaction, services);
}

type HandlerName = "list" | "info" | "enable" | "disable" | "help";

function runHandler(name: HandlerName, ctx: CommandContext) {
  return asHandler(moduleDef.handlers![name]!).run(ctx);
}

function lastCardJson() {
  const calls = (sendInteractionReply as any).mock.calls;
  return JSON.stringify(calls[calls.length - 1][1]);
}

describe("moduleDef", () => {
  let services: any;

  beforeEach(() => {
    vi.clearAllMocks();
    services = makeServices();
    (getUtility as any).mockReturnValue({ getInstalledModules: vi.fn().mockResolvedValue([]) });
  });

  describe("list", () => {
    it("reports when no modules were discovered", async () => {
      await runHandler("list", slashCtx({}, services));

      expect(paginateList).not.toHaveBeenCalled();
      expect(lastCardJson()).toContain("No modules discovered.");
    });

    it("paginates discovered modules for the invoker", async () => {
      const records = [
        { name: "afk", enabled: true, meta: { emoji: "💤", displayName: "AFK", version: "1.0.0" } },
        { name: "mod", enabled: false, meta: { emoji: "🛡️", displayName: "Moderation", version: "1.0.0" } },
      ];
      services = makeServices(records);

      await runHandler("list", slashCtx({}, services));

      const opts = (paginateList as any).mock.calls[0][0];
      expect(opts.userId).toBe("u-1");
      expect(opts.title).toBe("Discovered Modules");
      expect(opts.items).toHaveLength(2);
    });
  });

  describe("info", () => {
    it("reports unknown modules", async () => {
      await runHandler("info", slashCtx({ module: "ghost" }, services));

      expect(lastCardJson()).toContain("ghost");
    });

    it("shows the info card for a known module", async () => {
      services = makeServices([
        { name: "afk", enabled: true, meta: { displayName: "AFK" }, dir: "/m/afk" },
      ]);

      await runHandler("info", slashCtx({ module: "afk" }, services));

      expect(lastCardJson()).toContain("AFK");
    });
  });

  describe("enable/disable", () => {
    it("enables through the operations service", async () => {
      (setModuleEnabled as any).mockResolvedValue({ ok: true });

      await runHandler("enable", slashCtx({ module: "afk" }, services));

      expect(setModuleEnabled).toHaveBeenCalledWith("afk", true);
    });

    it("disables through the operations service", async () => {
      (setModuleEnabled as any).mockResolvedValue({ ok: true });

      await runHandler("disable", slashCtx({ module: "afk" }, services));

      expect(setModuleEnabled).toHaveBeenCalledWith("afk", false);
    });
  });
});
