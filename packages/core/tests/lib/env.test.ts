import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validateRequiredEnv, defineEnv, envField } from "#lib/env.js";

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

describe("defineEnv", () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ["TEST_STR", "TEST_INT", "TEST_BOOL", "TEST_OPT"]) {
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

  it("parses valid env variables matching the shape", () => {
    process.env["TEST_STR"] = "hello";
    process.env["TEST_INT"] = "42";
    process.env["TEST_BOOL"] = "true";

    const config = defineEnv({
      TEST_STR: envField.string(),
      TEST_INT: envField.integer(),
      TEST_BOOL: envField.boolean(),
      TEST_OPT: envField.string("fallback"),
    });

    expect(config.TEST_STR).toBe("hello");
    expect(config.TEST_INT).toBe(42);
    expect(config.TEST_BOOL).toBe(true);
    expect(config.TEST_OPT).toBe("fallback");
  });

  it("aggregates all missing and invalid errors at once", () => {
    process.env["TEST_INT"] = "invalid_number";
    process.env["TEST_BOOL"] = "maybe";

    expect(() =>
      defineEnv({
        TEST_STR: envField.string(),
        TEST_INT: envField.integer(),
        TEST_BOOL: envField.boolean(),
      }),
    ).toThrow("[ENV] Configuration errors:");
  });
});

