import { describe, expect, it } from "bun:test";
import {
  TimeoutError,
  withTimeout,
} from "#lib/utilities/Resilience.js";

describe("withTimeout", () => {
  it("resolves with the value when fn settles before the deadline", async () => {
    const result = await withTimeout(async () => "ok", 50);
    expect(result).toBe("ok");
  });

  it("throws TimeoutError when fn doesn't settle in time", async () => {
    await expect(
      withTimeout(() => new Promise((resolve) => setTimeout(resolve, 100)), 10),
    ).rejects.toBeInstanceOf(TimeoutError);
  });

  it("aborts the signal it hands to fn on timeout", async () => {
    let sawAbort = false;

    await expect(
      withTimeout((signal) => {
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            sawAbort = true;
            reject(new Error("aborted"));
          });
        });
      }, 10),
    ).rejects.toBeInstanceOf(TimeoutError);

    expect(sawAbort).toBe(true);
  });

  it("propagates fn's own error when it fails before the deadline", async () => {
    await expect(
      withTimeout(async () => {
        throw new Error("boom");
      }, 50),
    ).rejects.toThrow("boom");
  });
});
