import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { Command } from "iovalkey";
import { valkeyCommandDuration } from "@lumi/observability";
import { instrumentValkeyLatency } from "#lib/valkey/client.js";

/** Minimal stand-in for a Valkey/Cluster instance - only `sendCommand` is used. */
function makeFakeClient(resolveValue: unknown = "OK") {
  const sendCommand = (command: Command) => {
    command.resolve(resolveValue);
    return command.promise;
  };
  return { sendCommand } as unknown as Parameters<typeof instrumentValkeyLatency>[0];
}

describe("instrumentValkeyLatency", () => {
  let observeSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    observeSpy = spyOn(valkeyCommandDuration, "observe").mockImplementation(() => {});
  });

  afterEach(() => {
    observeSpy.mockRestore();
  });

  it("records latency for a non-blocking command, labelled by command name", async () => {
    const client = makeFakeClient();
    const instrumented = instrumentValkeyLatency(client);

    const command = new Command("get", ["foo"]);
    const result = await instrumented.sendCommand(command);

    expect(result).toBe("OK");
    expect(observeSpy).toHaveBeenCalledTimes(1);
    expect(observeSpy.mock.calls[0]?.[0]).toEqual({ command: "get" });
    expect(typeof observeSpy.mock.calls[0]?.[1]).toBe("number");
  });

  it("does not record latency for a blocking stream read (XREAD)", async () => {
    const client = makeFakeClient(null);
    const instrumented = instrumentValkeyLatency(client);

    const command = new Command("xread", ["BLOCK", "0", "STREAMS", "s", "$"]);
    await instrumented.sendCommand(command);

    expect(observeSpy).not.toHaveBeenCalled();
  });

  it("does not record latency for a blocking stream read (XREADGROUP)", async () => {
    const client = makeFakeClient(null);
    const instrumented = instrumentValkeyLatency(client);

    const command = new Command("xreadgroup", [
      "GROUP",
      "g",
      "c",
      "BLOCK",
      "0",
      "STREAMS",
      "s",
      ">",
    ]);
    await instrumented.sendCommand(command);

    expect(observeSpy).not.toHaveBeenCalled();
  });

  it("still records latency on a command rejection", async () => {
    const sendCommand = (command: Command) => {
      command.reject(new Error("boom"));
      return command.promise;
    };
    const client = { sendCommand } as unknown as Parameters<
      typeof instrumentValkeyLatency
    >[0];
    const instrumented = instrumentValkeyLatency(client);

    const command = new Command("set", ["foo", "bar"]);
    await expect(instrumented.sendCommand(command)).rejects.toThrow("boom");
    await Promise.resolve();

    expect(observeSpy).toHaveBeenCalledTimes(1);
    expect(observeSpy.mock.calls[0]?.[0]).toEqual({ command: "set" });
  });
});
