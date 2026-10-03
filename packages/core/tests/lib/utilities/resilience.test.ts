import { describe, expect, it } from "bun:test";
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
  TimeoutError,
  withTimeout,
} from "../../../src/lib/utilities/resilience.js";

const tick = (ms = 1) => new Promise((r) => setTimeout(r, ms));

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

describe("CircuitBreaker", () => {
  it("starts closed and passes calls through", async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 50 });
    expect(breaker.getState()).toBe("closed");
    await expect(breaker.run(async () => "ok")).resolves.toBe("ok");
    expect(breaker.getState()).toBe("closed");
  });

  it("trips to open after failureThreshold consecutive failures", async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 50 });
    const fail = () => breaker.run(async () => Promise.reject(new Error("fail")));

    await expect(fail()).rejects.toThrow("fail");
    expect(breaker.getState()).toBe("closed");

    await expect(fail()).rejects.toThrow("fail");
    expect(breaker.getState()).toBe("open");
  });

  it("rejects immediately with CircuitBreakerOpenError while open", async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 1000 });
    await expect(breaker.run(async () => Promise.reject(new Error("fail")))).rejects.toThrow(
      "fail",
    );
    expect(breaker.getState()).toBe("open");

    let called = false;
    await expect(
      breaker.run(async () => {
        called = true;
      }),
    ).rejects.toBeInstanceOf(CircuitBreakerOpenError);
    expect(called).toBe(false);
  });

  it("allows a single half-open probe after cooldown, closing on success", async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 10 });
    await expect(breaker.run(async () => Promise.reject(new Error("fail")))).rejects.toThrow(
      "fail",
    );
    expect(breaker.getState()).toBe("open");

    await tick(15);
    expect(breaker.getState()).toBe("half-open");

    await expect(breaker.run(async () => "recovered")).resolves.toBe("recovered");
    expect(breaker.getState()).toBe("closed");
  });

  it("reopens on a failed half-open probe", async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 10 });
    await expect(breaker.run(async () => Promise.reject(new Error("fail")))).rejects.toThrow(
      "fail",
    );
    await tick(15);
    expect(breaker.getState()).toBe("half-open");

    await expect(breaker.run(async () => Promise.reject(new Error("still failing")))).rejects.toThrow(
      "still failing",
    );
    expect(breaker.getState()).toBe("open");
  });
});
