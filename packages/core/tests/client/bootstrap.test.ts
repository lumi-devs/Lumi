import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  bootstrapClientApp,
  registerProcessErrorHandlers,
} from "../../src/lib/client/bootstrap.js";
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
    process.env["APPEAL_TOKEN_SECRET"] = "test-appeal-secret";
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
    (LumiClient.bootstrap as any).mockReturnValue(mockClient);

    const client = await bootstrapClientApp({});

    expect(LumiClient.bootstrap).toHaveBeenCalledWith({});
    expect(mockClient.login).toHaveBeenCalledWith("mock.bot.token.12345");
    expect(container.logger.info).toHaveBeenCalledWith("[Lumi] Online");
    expect(client).toBe(mockClient as any);
  });

  it("exits before touching LumiClient when required env vars are missing", async () => {
    (LumiClient.bootstrap as any).mockClear();
    delete process.env.BOT_TOKEN;
    delete process.env["APPEAL_TOKEN_SECRET"];
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exit");
    }) as any);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(bootstrapClientApp({})).rejects.toThrow("exit");

    expect(LumiClient.bootstrap).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("BOT_TOKEN, APPEAL_TOKEN_SECRET"),
    );
  });

  it("destroys client and exits process if login fails", async () => {
    const mockClient = {
      login: vi.fn().mockRejectedValue(new Error("Invalid Token")),
      destroy: vi.fn().mockResolvedValue(undefined),
    };
    (LumiClient.bootstrap as any).mockReturnValue(mockClient);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);

    await bootstrapClientApp({ onlineMessage: "Scheduler Custom Online" });

    expect(container.logger.fatal).toHaveBeenCalledWith("[Lumi] Fatal:", expect.any(Error));
    expect(mockClient.destroy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe("registerProcessErrorHandlers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
    } as any;
  });

  it("registers unhandledRejection and uncaughtException listeners without accumulating duplicates on repeat calls", () => {
    registerProcessErrorHandlers();
    const first = {
      rejection: process.listenerCount("unhandledRejection"),
      exception: process.listenerCount("uncaughtException"),
    };

    registerProcessErrorHandlers();
    registerProcessErrorHandlers();

    expect(first.rejection).toBeGreaterThan(0);
    expect(first.exception).toBeGreaterThan(0);
    expect(process.listenerCount("unhandledRejection")).toBe(first.rejection);
    expect(process.listenerCount("uncaughtException")).toBe(first.exception);
  });

  it("logs via container.logger.error (not fatal, no exit) when an unhandledRejection fires", () => {
    registerProcessErrorHandlers();
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as any);
    const reason = new Error("boom");

    process.emit("unhandledRejection", reason, Promise.resolve() as any);

    expect(container.logger.error).toHaveBeenCalledWith(
      "[Process: Unhandled promise rejection]",
      reason,
    );
    expect(container.logger.fatal).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("logs via container.logger.fatal and exits(1) when an uncaughtException fires", () => {
    registerProcessErrorHandlers();
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as any);
    const err = new Error("fatal boom");

    process.emit("uncaughtException", err, "uncaughtException" as any);

    expect(container.logger.fatal).toHaveBeenCalledWith(
      "[Process] Uncaught exception - exiting:",
      err,
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
