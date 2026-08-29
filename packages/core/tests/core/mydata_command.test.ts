import { describe, it, expect, vi, beforeEach } from "vitest";
import { container } from "@sapphire/framework";
import { MyDataCommand } from "#modules/core/commands/mydata.js";
import * as gdpr from "#lib/gdpr.js";
import * as confirm from "#lib/utilities/confirm.js";

vi.mock("#lib/module-system/Service.js", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    getService: vi.fn(),
  };
});

import { getService } from "#lib/module-system/Service.js";

describe("MyDataCommand", () => {
  let command: MyDataCommand;
  let mockDownloaderService: any;
  let mockCtx: any;

  beforeEach(() => {
    vi.restoreAllMocks();

    mockDownloaderService = {
      getInstalledModules: vi.fn().mockResolvedValue([]),
    };

    (getService as any).mockImplementation((name: string) => {
      if (name === "downloader") return mockDownloaderService;
      return null;
    });

    (container as any).client = {
      options: {},
    } as any;

    command = new MyDataCommand(
      {
        name: "mydata",
        root: "/mock",
        path: "/mock/mydata.ts",
        store: { name: "commands" } as any,
      },
      {
        name: "mydata",
        description: "mydata command",
        subcommands: [],
      } as any,
    );

    mockCtx = {
      user: { id: "123456789", tag: "testuser#0001" },
      isSlash: false,
      reply: vi.fn().mockResolvedValue(undefined),
      message: {
        reply: vi.fn().mockResolvedValue(undefined),
      },
    };
  });

  describe("whatthisdoes", () => {
    it("replies with privacy information card", async () => {
      await command.whatthisdoes(mockCtx);
      expect(mockCtx.reply).toHaveBeenCalledTimes(1);
      const arg = mockCtx.reply.mock.calls[0][0];
      expect(JSON.stringify(arg)).toContain("End-User Data & Privacy in Lumi");
      expect(JSON.stringify(arg)).toContain("Right to Erasure");
    });
  });

  describe("3rdparty", () => {
    it("reports when no 3rd party addons are installed", async () => {
      mockDownloaderService.getInstalledModules.mockResolvedValue([]);
      await command.thirdParty(mockCtx);
      expect(mockCtx.reply).toHaveBeenCalledTimes(1);
      const arg = mockCtx.reply.mock.calls[0][0];
      expect(JSON.stringify(arg)).toContain("does not have any third-party addons installed");
    });

    it("lists 3rd party addons and privacy statements when installed", async () => {
      mockDownloaderService.getInstalledModules.mockResolvedValue([
        { repo_name: "test-repo", moduleName: "economy", commit: "abc", pinned: false },
      ]);

      (container as any).moduleStore = {
        getRecord: vi.fn().mockReturnValue({
          meta: {
            name: "economy",
            displayName: "Economy",
            emoji: "💰",
            endUserDataStatement: "Stores user balance and inventory.",
          },
        }),
      };

      await command.thirdParty(mockCtx);
      expect(mockCtx.reply).toHaveBeenCalledTimes(1);
      const arg = mockCtx.reply.mock.calls[0][0];
      expect(JSON.stringify(arg)).toContain("Stores user balance and inventory.");
    });
  });

  describe("owninfo", () => {
    it("exports user data and attaches json file", async () => {
      vi.spyOn(gdpr, "executeGdprExport").mockResolvedValue({
        core: { blocklisted: false },
        afk: { afk: false },
      });

      await command.ownInfo(mockCtx);
      expect(gdpr.executeGdprExport).toHaveBeenCalledWith("123456789");
      expect(mockCtx.message.reply).toHaveBeenCalledTimes(1);
      const arg = mockCtx.message.reply.mock.calls[0][0];
      expect(arg.files).toBeDefined();
      expect(arg.files.length).toBe(1);
      expect(arg.files[0].name).toBe("lumi-user-data-123456789.json");
    });
  });

  describe("deleteuser", () => {
    it("cancels deletion when user denies prompt", async () => {
      vi.spyOn(confirm, "confirmPrompt").mockResolvedValue(false);
      const deleteSpy = vi.spyOn(gdpr, "executeGdprDeletion");

      await command.deleteUser(mockCtx);
      expect(confirm.confirmPrompt).toHaveBeenCalledTimes(1);
      expect(deleteSpy).not.toHaveBeenCalled();
      const arg = mockCtx.reply.mock.calls[0][0];
      expect(JSON.stringify(arg)).toContain("Cancelled");
    });

    it("executes deletion when user confirms prompt", async () => {
      vi.spyOn(confirm, "confirmPrompt").mockResolvedValue(true);
      vi.spyOn(gdpr, "executeGdprDeletion").mockResolvedValue({ failedModules: [] });

      await command.deleteUser(mockCtx);
      expect(confirm.confirmPrompt).toHaveBeenCalledTimes(1);
      expect(gdpr.executeGdprDeletion).toHaveBeenCalledWith("123456789", "testuser#0001");
      const arg = mockCtx.reply.mock.calls[0][0];
      expect(JSON.stringify(arg)).toContain("Data Deleted");
    });
  });
});
