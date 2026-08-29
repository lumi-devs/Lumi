import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validateRequiredEnv } from "#lib/env.js";

describe("validateRequiredEnv", () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ["ENV_TEST_A", "ENV_TEST_B"]) {
      original[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("does not throw when every key is present", () => {
    process.env["ENV_TEST_A"] = "a";
    process.env["ENV_TEST_B"] = "b";
    expect(() => validateRequiredEnv(["ENV_TEST_A", "ENV_TEST_B"])).not.toThrow();
  });

  it("aggregates every missing key into a single error", () => {
    expect(() => validateRequiredEnv(["ENV_TEST_A", "ENV_TEST_B"])).toThrow(
      "[ENV] Missing required environment variable(s): ENV_TEST_A, ENV_TEST_B",
    );
  });

  it("reports only the keys that are actually missing", () => {
    process.env["ENV_TEST_A"] = "a";
    expect(() => validateRequiredEnv(["ENV_TEST_A", "ENV_TEST_B"])).toThrow(
      "[ENV] Missing required environment variable(s): ENV_TEST_B",
    );
  });
});
