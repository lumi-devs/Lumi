import { describe, it, expect, vi, beforeEach } from "vitest";
import { container } from "@sapphire/framework";
import { DashboardCommand } from "#modules/core/commands/dashboard.js";

vi.mock("#lib/module-system/Utility.js", async (importOriginal) => {
  const actual: any = await importOriginal();
  return { ...actual, getUtility: vi.fn() };
});

import { getUtility } from "#lib/module-system/Utility.js";

describe("DashboardCommand", () => {
  let command: DashboardCommand;
  let guildSettings: any;

  beforeEach(() => {
    vi.clearAllMocks();

    guildSettings = {
      setDashboardLayout: vi.fn().mockResolvedValue(["cases", "modules"]),
    };

    (getUtility as any).mockImplementation((name: string) =>
      name === "guild-settings" ? guildSettings : null,
    );

    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;
    (container as any).client = { options: {} };

    command = new DashboardCommand(
      {
        name: "dashboard",
        path: "/path/to/commands/dashboard.ts",
        root: "/path/to/commands",
        store: { name: "commands" } as any,
      },
      { prefixEnabled: true },
    );
  });

  function createMockCtx(layout: string | null = '["cases","modules"]') {
    return {
      isSlash: false,
      guildId: "g-1",
      user: { id: "u-1", tag: "Tester#0001" },
      source: {},
      fetchT: vi.fn().mockResolvedValue((key: string) => key),
      getString: vi.fn().mockResolvedValue(layout),
      reply: vi.fn().mockResolvedValue(undefined),
      replySuccess: vi.fn().mockResolvedValue(undefined),
      replyError: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("reads the layout option as rest text so multi-word input survives", async () => {
    const ctx = createMockCtx();

    await command.layout(ctx as any);

    expect(ctx.getString).toHaveBeenCalledWith("layout", {
      rest: true,
      required: true,
    });
  });

  it("stores the raw layout against the invoking guild", async () => {
    const ctx = createMockCtx('["cases","modules"]');

    await command.layout(ctx as any);

    expect(guildSettings.setDashboardLayout).toHaveBeenCalledWith(
      "g-1",
      '["cases","modules"]',
    );
  });

  it("confirms and logs once the layout is persisted", async () => {
    const ctx = createMockCtx();

    await command.layout(ctx as any);

    expect(ctx.replySuccess).toHaveBeenCalled();
    expect(ctx.replyError).not.toHaveBeenCalled();
    expect(container.logger.info).toHaveBeenCalledWith(
      expect.stringContaining("g-1"),
    );
  });

  it("surfaces the validation failure for malformed layout JSON", async () => {
    guildSettings.setDashboardLayout.mockRejectedValue(
      new Error("The layout must be valid JSON (parse failed)."),
    );
    const ctx = createMockCtx("not json");

    await command.layout(ctx as any);

    expect(ctx.replyError).toHaveBeenCalledWith(
      expect.any(String),
      "The layout must be valid JSON (parse failed).",
    );
    expect(ctx.replySuccess).not.toHaveBeenCalled();
  });

  it("surfaces the validation failure when the layout is not an array", async () => {
    guildSettings.setDashboardLayout.mockRejectedValue(
      new Error("The layout must be a valid JSON array of widget names."),
    );
    const ctx = createMockCtx('{"a":1}');

    await command.layout(ctx as any);

    expect(ctx.replyError).toHaveBeenCalledWith(
      expect.any(String),
      "The layout must be a valid JSON array of widget names.",
    );
  });

  it("does not log a success line when persistence fails", async () => {
    guildSettings.setDashboardLayout.mockRejectedValue(new Error("db down"));
    const ctx = createMockCtx();

    await command.layout(ctx as any);

    expect(container.logger.info).not.toHaveBeenCalled();
  });
});
