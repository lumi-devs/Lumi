import { describe, it, expect, vi, beforeEach } from "vitest";
import { bootstrapClientApp } from "../../src/lib/client/bootstrap.js";
import { LumiClient } from "../../src/lib/client/LumiClient.js";
import { container } from "@sapphire/framework";

vi.mock("../../src/lib/client/LumiClient.js", () => ({
  LumiClient: {
    bootstrap: vi.fn(),
  },
}));

vi.mock("@lumi/observability", () => ({
  shutdownTracing: vi.fn().mockResolvedValue(undefined),
  runDrainSequence: vi.fn().mockResolvedValue(undefined),
}));

describe("bootstrapClientApp", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.BOT_TOKEN = "mock.bot.token.12345";
    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
    } as any;
  });

  it("bootstraps client and logs online message on successful login", async () => {
    const mockClient = {
      login: vi.fn().mockResolvedValue("mock.bot.token.12345"),
      destroy: vi.fn().mockResolvedValue(undefined),
    };
    (LumiClient.bootstrap as any).mockResolvedValue(mockClient);

    const client = await bootstrapClientApp({ role: "worker" });

    expect(LumiClient.bootstrap).toHaveBeenCalledWith({ role: "worker" });
    expect(mockClient.login).toHaveBeenCalledWith("mock.bot.token.12345");
    expect(container.logger.info).toHaveBeenCalledWith("[Worker] Online");
    expect(client).toBe(mockClient as any);
  });

  it("destroys client and exits process if login fails", async () => {
    const mockClient = {
      login: vi.fn().mockRejectedValue(new Error("Invalid Token")),
      destroy: vi.fn().mockResolvedValue(undefined),
    };
    (LumiClient.bootstrap as any).mockResolvedValue(mockClient);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);

    await bootstrapClientApp({ role: "scheduler", onlineMessage: "Scheduler Custom Online" });

    expect(container.logger.fatal).toHaveBeenCalledWith("[scheduler] Fatal:", expect.any(Error));
    expect(mockClient.destroy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
