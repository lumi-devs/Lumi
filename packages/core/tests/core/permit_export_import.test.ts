import { describe, it, expect, vi, beforeEach } from "vitest";
import { container } from "@sapphire/framework";
import { PermitCommand } from "#modules/core/commands/permit.js";

vi.mock("#lib/module-system/Utility.js", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    getUtility: vi.fn(),
  };
});

import { getUtility } from "#lib/module-system/Utility.js";

describe("PermitCommand export/import", () => {
  let command: PermitCommand;
  let mockPermissionsService: any;

  beforeEach(() => {
    vi.restoreAllMocks();

    mockPermissionsService = {
      exportPermits: vi.fn(),
      importPermits: vi.fn(),
    };
    (getUtility as any).mockReturnValue(mockPermissionsService);

    (container as any).logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    (container as any).client = { options: {} };

    command = new PermitCommand(
      {
        name: "permit",
        path: "/path/to/commands/permit.ts",
        root: "/path/to/commands",
        store: { name: "commands" } as any,
      },
      { prefixEnabled: true },
    );
  });

  function createMockCtx(overrides: Partial<any> = {}) {
    return {
      defer: vi.fn().mockResolvedValue(undefined),
      fetchT: vi.fn().mockResolvedValue((key: string, vars?: Record<string, unknown>) =>
        vars ? `${key}:${JSON.stringify(vars)}` : key,
      ),
      replySuccess: vi.fn().mockResolvedValue(undefined),
      replyError: vi.fn().mockResolvedValue(undefined),
      replyInfo: vi.fn().mockResolvedValue(undefined),
      isSlash: false,
      guildId: "g1",
      message: { reply: vi.fn().mockResolvedValue(undefined), attachments: { first: vi.fn().mockReturnValue(null) } },
      ...overrides,
    };
  }

  describe("export", () => {
    it("replies with an info card when there are no custom permits", async () => {
      mockPermissionsService.exportPermits.mockResolvedValue({ version: 1, exportedAt: "now", permits: [] });
      const ctx = createMockCtx();

      await command.export(ctx as any);

      expect(ctx.replyInfo).toHaveBeenCalled();
      expect(ctx.message.reply).not.toHaveBeenCalled();
    });

    it("sends a JSON file attachment on the prefix path when permits exist", async () => {
      mockPermissionsService.exportPermits.mockResolvedValue({
        version: 1,
        exportedAt: "now",
        permits: [{ name: "Mods", nodes: ["mod.*"], roleIds: [] }],
      });
      const ctx = createMockCtx();

      await command.export(ctx as any);

      expect(ctx.message.reply).toHaveBeenCalledWith(
        expect.objectContaining({ files: expect.any(Array) }),
      );
    });

    it("sends the file via sendReply on the slash path when permits exist", async () => {
      mockPermissionsService.exportPermits.mockResolvedValue({
        version: 1,
        exportedAt: "now",
        permits: [{ name: "Mods", nodes: ["mod.*"], roleIds: [] }],
      });
      const editReply = vi.fn().mockResolvedValue(undefined);
      const ctx = createMockCtx({
        isSlash: true,
        interaction: { deferred: true, replied: false, editReply },
      });

      await command.export(ctx as any);

      expect(editReply).toHaveBeenCalledWith(
        expect.objectContaining({ files: expect.any(Array) }),
      );
    });
  });

  describe("import", () => {
    it("replies with an error when no attachment is provided", async () => {
      const ctx = createMockCtx();

      await command.import(ctx as any);

      expect(ctx.replyError).toHaveBeenCalled();
      expect(mockPermissionsService.importPermits).not.toHaveBeenCalled();
    });

    it("rejects an attachment that's too large", async () => {
      const ctx = createMockCtx({
        message: {
          attachments: {
            first: vi.fn().mockReturnValue({ url: "https://cdn/x.json", size: 999_999_999 }),
          },
        },
      });

      await command.import(ctx as any);

      expect(ctx.replyError).toHaveBeenCalled();
      expect(mockPermissionsService.importPermits).not.toHaveBeenCalled();
    });

    it("replies with an error when the file can't be fetched or parsed", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ text: () => Promise.resolve("not json") }),
      );
      const ctx = createMockCtx({
        message: {
          attachments: {
            first: vi.fn().mockReturnValue({ url: "https://cdn/x.json", size: 100 }),
          },
        },
      });

      await command.import(ctx as any);

      expect(ctx.replyError).toHaveBeenCalled();
      expect(mockPermissionsService.importPermits).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it("imports successfully and reports created/updated/skipped counts", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          text: () => Promise.resolve(JSON.stringify({ permits: [{ name: "Mods", nodes: ["mod.*"], roleIds: [] }] })),
        }),
      );
      mockPermissionsService.importPermits.mockResolvedValue({ created: 1, updated: 0, skipped: [] });
      const ctx = createMockCtx({
        message: {
          attachments: {
            first: vi.fn().mockReturnValue({ url: "https://cdn/x.json", size: 100 }),
          },
        },
      });

      await command.import(ctx as any);

      expect(mockPermissionsService.importPermits).toHaveBeenCalledWith("g1", {
        permits: [{ name: "Mods", nodes: ["mod.*"], roleIds: [] }],
      });
      expect(ctx.replySuccess).toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it("reports skipped entries in the success message", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ text: () => Promise.resolve(JSON.stringify({ permits: [] })) }),
      );
      mockPermissionsService.importPermits.mockResolvedValue({
        created: 0,
        updated: 0,
        skipped: [{ name: "Bad", reason: "invalid node" }],
      });
      const ctx = createMockCtx({
        message: {
          attachments: {
            first: vi.fn().mockReturnValue({ url: "https://cdn/x.json", size: 100 }),
          },
        },
      });

      await command.import(ctx as any);

      const [, body] = ctx.replySuccess.mock.calls[0];
      expect(body).toContain("Bad");
      vi.unstubAllGlobals();
    });

    it("replies with an error when importPermits throws", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ text: () => Promise.resolve(JSON.stringify({ permits: [] })) }),
      );
      mockPermissionsService.importPermits.mockRejectedValue(new Error("db exploded"));
      const ctx = createMockCtx({
        message: {
          attachments: {
            first: vi.fn().mockReturnValue({ url: "https://cdn/x.json", size: 100 }),
          },
        },
      });

      await command.import(ctx as any);

      expect(ctx.replyError).toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it("reads the attachment from the slash interaction option when on the slash path", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ text: () => Promise.resolve(JSON.stringify({ permits: [] })) }),
      );
      mockPermissionsService.importPermits.mockResolvedValue({ created: 0, updated: 0, skipped: [] });
      const getAttachment = vi.fn().mockReturnValue({ url: "https://cdn/x.json", size: 100 });
      const ctx = createMockCtx({
        isSlash: true,
        interaction: { options: { getAttachment } },
      });

      await command.import(ctx as any);

      expect(getAttachment).toHaveBeenCalledWith("file");
      expect(mockPermissionsService.importPermits).toHaveBeenCalled();
      vi.unstubAllGlobals();
    });
  });
});
