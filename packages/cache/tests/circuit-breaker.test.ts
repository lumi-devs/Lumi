import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CircuitBreaker, CircuitState } from "../src/circuit-breaker.js";

describe("CircuitBreaker", () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    vi.useFakeTimers();
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 100,
    });
  });

  afterEach(() => {
    breaker.reset();
    vi.useRealTimers();
  });

  it("starts in closed state", () => {
    expect(breaker.getState()).toBe(CircuitState.Closed);
  });

  it("executes operation successfully in closed state", async () => {
    const result = await breaker.execute(() => Promise.resolve("success"));
    expect(result).toBe("success");
    expect(breaker.getState()).toBe(CircuitState.Closed);
  });

  it("opens after failure threshold", async () => {
    await expect(breaker.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow();
    await expect(breaker.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow();
    await expect(breaker.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow();

    expect(breaker.getState()).toBe(CircuitState.Open);
  });

  it("rejects immediately when open", async () => {
    await expect(breaker.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow();
    await expect(breaker.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow();
    await expect(breaker.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow();

    await expect(breaker.execute(() => Promise.resolve("success"))).rejects.toThrow("Circuit breaker is open");
  });

  it("transitions to half-open after timeout", async () => {
    await expect(breaker.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow();
    await expect(breaker.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow();
    await expect(breaker.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow();

    expect(breaker.getState()).toBe(CircuitState.Open);

    vi.advanceTimersByTime(150);

    expect(breaker.getState()).toBe(CircuitState.HalfOpen);
  });

  it("closes after success threshold in half-open", async () => {
    await expect(breaker.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow();
    await expect(breaker.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow();
    await expect(breaker.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow();

    vi.advanceTimersByTime(150);

    expect(breaker.getState()).toBe(CircuitState.HalfOpen);

    await breaker.execute(() => Promise.resolve("success"));
    expect(breaker.getState()).toBe(CircuitState.HalfOpen);

    await breaker.execute(() => Promise.resolve("success"));
    expect(breaker.getState()).toBe(CircuitState.Closed);
  });

  it("reopens on failure in half-open", async () => {
    await expect(breaker.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow();
    await expect(breaker.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow();
    await expect(breaker.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow();

    vi.advanceTimersByTime(150);

    expect(breaker.getState()).toBe(CircuitState.HalfOpen);

    await expect(breaker.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow();
    expect(breaker.getState()).toBe(CircuitState.Open);
  });

  it("resets to closed state", async () => {
    await expect(breaker.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow();
    await expect(breaker.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow();
    await expect(breaker.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow();

    expect(breaker.getState()).toBe(CircuitState.Open);

    breaker.reset();

    expect(breaker.getState()).toBe(CircuitState.Closed);
    await expect(breaker.execute(() => Promise.resolve("success"))).resolves.toBe("success");
  });

  it("calls onStateChange callback", async () => {
    const states: CircuitState[] = [];
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      successThreshold: 1,
      timeout: 100,
      onStateChange: (state) => states.push(state),
    });

    await expect(breaker.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow();
    await expect(breaker.execute(() => Promise.reject(new Error("fail")))).rejects.toThrow();

    expect(states).toContain(CircuitState.Open);

    vi.advanceTimersByTime(150);
    await breaker.execute(() => Promise.resolve("success"));

    expect(states).toContain(CircuitState.HalfOpen);
    expect(states).toContain(CircuitState.Closed);
  });
});