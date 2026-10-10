import {
  describe,
  it,
  expect,
  beforeEach,
  mock,
  spyOn,
} from "bun:test";
import {
  bootstrapClientApp,
  registerProcessErrorHandlers,
} from "../../src/lib/client/bootstrap.js";

const attachClient = mock(() => {});
const loginLumi = mock(() => Promise.resolve("mock.bot.token.12345"));
const destroyLumi = mock(() => Promise.resolve(undefined));

mock.module("../../src/lib/client/lumi-client.js", () => ({
  attachClient,
  loginLumi,
  destroyLumi,
}));

const logger = {
  info: mock(() => {}),
  warn: mock(() => {}),
  error: mock(() => {}),
  fatal: mock(() => {}),
};
const container: Record<string, any> = { logger };
const createServices = mock(() => ({ client: undefined }));
const useServices = mock(() => {});

mock.module("../../src/lib/services.js", () => ({
  container,
  createServices,
  useServices,
  ownedEventBusOf: () => undefined,
}));

mock.module("../../src/lib/client/client-options.js", () => ({
  buildClientOptions: () => ({ intents: [] }),
}));

mock.module("@lumi/observability", () => ({
  shutdownTracing: () => Promise.resolve(undefined),
  runDrainSequence: () => Promise.resolve(undefined),
}));

describe("bootstrapClientApp", () => {
  beforeEach(() => {
    attachClient.mockClear();
    loginLumi.mockClear();
    destroyLumi.mockClear();
    createServices.mockClear();
    useServices.mockClear();
    for (const fn of Object.values(logger)) fn.mockClear();
    process.env.BOT_TOKEN = "mock.bot.token.12345";
    process.env["APPEAL_TOKEN_SECRET"] = "test-appeal-secret";
  });

  it("bootstraps client and logs online message on successful login", async () => {
    const client = await bootstrapClientApp({});

    expect(createServices).toHaveBeenCalledTimes(1);
    expect(useServices).toHaveBeenCalledTimes(1);
    expect(attachClient).toHaveBeenCalledTimes(1);
    expect(loginLumi).toHaveBeenCalledWith(
      client,
      container,
      "mock.bot.token.12345",
    );
    expect(logger.info).toHaveBeenCalledWith("[Lumi] Online");
  });

  it("exits before touching services when required env vars are missing", async () => {
    delete process.env.BOT_TOKEN;
    delete process.env["APPEAL_TOKEN_SECRET"];
    const exitSpy = spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});

    await expect(bootstrapClientApp({})).rejects.toThrow("exit");

    expect(createServices).not.toHaveBeenCalled();
    expect(loginLumi).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("BOT_TOKEN, APPEAL_TOKEN_SECRET"),
    );
    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it("destroys client and exits process if login fails", async () => {
    loginLumi.mockRejectedValueOnce(new Error("Invalid Token"));
    const exitSpy = spyOn(process, "exit").mockImplementation((() => {}) as any);

    await bootstrapClientApp({ onlineMessage: "Scheduler Custom Online" });

    expect(logger.fatal).toHaveBeenCalledWith(
      "[Lumi] Fatal:",
      expect.any(Error),
    );
    expect(destroyLumi).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });
});

describe("registerProcessErrorHandlers", () => {
  beforeEach(() => {
    for (const fn of Object.values(logger)) fn.mockClear();
    container.logger = logger;
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
    const exitSpy = spyOn(process, "exit").mockImplementation(
      (() => undefined) as any,
    );
    const reason = new Error("boom");

    process.emit("unhandledRejection", reason, Promise.resolve() as any);

    expect(logger.error).toHaveBeenCalledWith(
      "[Process: Unhandled promise rejection]",
      reason,
    );
    expect(logger.fatal).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });

  it("logs via container.logger.fatal and exits(1) when an uncaughtException fires", () => {
    registerProcessErrorHandlers();
    const exitSpy = spyOn(process, "exit").mockImplementation(
      (() => undefined) as any,
    );
    const err = new Error("fatal boom");

    process.emit("uncaughtException", err);

    expect(logger.fatal).toHaveBeenCalledWith(
      "[Process] Uncaught exception - exiting:",
      err,
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it("falls back to console.error when container.logger is undefined on unhandledRejection", () => {
    delete container.logger;
    registerProcessErrorHandlers();
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = spyOn(process, "exit").mockImplementation(
      (() => undefined) as any,
    );
    const reason = new Error("rejection without logger");

    process.emit("unhandledRejection", reason, Promise.resolve() as any);

    expect(consoleSpy).toHaveBeenCalledWith(
      "[Process: Unhandled promise rejection]",
      reason,
    );
    expect(exitSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
    exitSpy.mockRestore();
    container.logger = logger;
  });

  it("falls back to console.error and exits(1) when container.logger is undefined on uncaughtException", () => {
    delete container.logger;
    registerProcessErrorHandlers();
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = spyOn(process, "exit").mockImplementation(
      (() => undefined) as any,
    );
    const err = new Error("fatal without logger");

    process.emit("uncaughtException", err, "uncaughtException" as any);

    expect(consoleSpy).toHaveBeenCalledWith(
      "[Process] Uncaught exception - exiting:",
      err,
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
    consoleSpy.mockRestore();
    exitSpy.mockRestore();
    container.logger = logger;
  });
});
