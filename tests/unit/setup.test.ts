import { describe, expect, it } from "vitest";
import {
  databaseUrlFrom,
  validateDatabaseUrl,
} from "../../scripts/setup/database.ts";
import {
  validateBotToken,
  validateOwnerIds,
} from "../../scripts/setup/discord.ts";
import {
  applyDefaults,
  formatEnvValue,
  parseEnv,
  redactUrl,
  upsertEnv,
  validateEnv,
} from "../../scripts/setup/env.ts";
import { redisUrlFrom, validateRedisUrl } from "../../scripts/setup/redis.ts";
import { isPlaceholder, parseArgs } from "../../scripts/setup/shared.ts";

const validToken = "test-token.abc123.not-a-real-token";
const validOwners = "123456789012345678,987654321098765432";
const validDatabase = "postgresql://lumi:lumi@127.0.0.1:5432/lumi";
const validRedis = "redis://localhost:6379/0";

function validValues(): Map<string, string> {
  return new Map([
    ["BOT_TOKEN", validToken],
    ["OWNER_IDS", validOwners],
    ["DATABASE_URL", validDatabase],
    ["REDIS_URL", validRedis],
  ]);
}

describe("parseEnv", () => {
  it("parses quoted, unquoted, exported, and commented values", () => {
    const values = parseEnv(
      [
        "# comment",
        "BOT_TOKEN=abc.def.ghi",
        'DATABASE_URL="postgresql://lumi:lumi@localhost:5432/lumi"',
        "PREFIX=, # default prefix",
        "export LOG_LEVEL=debug",
        "NAME='two words'",
      ].join("\n"),
    );

    expect(values.get("BOT_TOKEN")).toBe("abc.def.ghi");
    expect(values.get("DATABASE_URL")).toBe(
      "postgresql://lumi:lumi@localhost:5432/lumi",
    );
    expect(values.get("PREFIX")).toBe(",");
    expect(values.get("LOG_LEVEL")).toBe("debug");
    expect(values.get("NAME")).toBe("two words");
  });
});

describe("upsertEnv", () => {
  it("updates existing keys and appends new ones without touching comments", () => {
    const original = [
      "# keep this comment",
      "BOT_TOKEN=old",
      "UNRELATED=keep",
      "",
    ].join("\n");
    const updated = upsertEnv(original, {
      BOT_TOKEN: "new-token",
      REDIS_URL: "redis://:secret@localhost:6379/0",
      NAME: "two words",
    });

    expect(updated).toContain("# keep this comment");
    expect(updated).toContain("BOT_TOKEN=new-token");
    expect(updated).toContain("UNRELATED=keep");
    expect(updated).toContain("REDIS_URL=redis://:secret@localhost:6379/0");
    expect(updated).toContain('NAME="two words"');
    expect(updated).not.toContain("BOT_TOKEN=old");
    expect(updated.endsWith("\n")).toBe(true);
  });

  it("returns the input unchanged when there is nothing to update", () => {
    const original = "BOT_TOKEN=old\n";
    expect(upsertEnv(original, {})).toBe(original);
  });
});

describe("formatEnvValue", () => {
  it("quotes values that need escaping", () => {
    expect(formatEnvValue(",")).toBe(",");
    expect(formatEnvValue("info")).toBe("info");
    expect(formatEnvValue("two words")).toBe('"two words"');
    expect(formatEnvValue("hash#value")).toBe('"hash#value"');
  });
});

describe("validation", () => {
  it("accepts a modern bot token and rejects common mistakes", () => {
    expect(validateBotToken(validToken)).toBeNull();
    expect(validateBotToken("replace-me")).not.toBeNull();
    expect(validateBotToken(`Bot ${validToken}`)).not.toBeNull();
    expect(validateBotToken("abc.def")).not.toBeNull();
    expect(validateBotToken("abc def ghi")).not.toBeNull();
  });

  it("validates owner snowflakes", () => {
    expect(validateOwnerIds(validOwners)).toBeNull();
    expect(validateOwnerIds("not-an-id")).not.toBeNull();
    expect(validateOwnerIds("")).not.toBeNull();
  });

  it("validates database and Redis URLs", () => {
    expect(validateDatabaseUrl(validDatabase)).toBeNull();
    expect(validateDatabaseUrl("mysql://localhost/lumi")).not.toBeNull();
    expect(validateDatabaseUrl("postgresql://localhost")).not.toBeNull();
    expect(validateRedisUrl(validRedis)).toBeNull();
    expect(validateRedisUrl("http://localhost:6379")).not.toBeNull();
    expect(validateRedisUrl("redis://")).not.toBeNull();
  });

  it("reports every missing required variable", () => {
    const issues = validateEnv(new Map());
    expect(issues.map((issue) => issue.key)).toEqual([
      "BOT_TOKEN",
      "OWNER_IDS",
      "DATABASE_URL",
      "REDIS_URL",
    ]);
  });

  it("accepts a complete environment", () => {
    expect(validateEnv(validValues())).toEqual([]);
  });

  it("rejects an invalid metrics port", () => {
    const values = validValues();
    values.set("METRICS_PORT", "99999");
    expect(validateEnv(values).map((issue) => issue.key)).toContain(
      "METRICS_PORT",
    );
  });
});

describe("applyDefaults", () => {
  it("creates safe defaults for a fresh non-Docker install", () => {
    const updates = applyDefaults(new Map(), { compose: false });

    expect(updates.DATABASE_URL).toBe(validDatabase);
    expect(updates.REDIS_URL).toBe(validRedis);
    expect(updates.LOG_LEVEL).toBe("info");
    expect(updates.METRICS_PORT).toBe("9090");
    expect(updates.DEFAULT_PREFIX).toBe(",");
    expect(updates.REDIS_PASSWORD).toBeUndefined();
    expect(updates.RPC_INTERNAL_TOKEN).toBeUndefined();
  });

  it("generates Docker Compose secrets and keeps the Redis URL in sync", () => {
    const updates = applyDefaults(new Map(), {
      compose: true,
      generateSecret: () => "generated-secret",
    });

    expect(updates.REDIS_PASSWORD).toBe("generated-secret");
    expect(updates.REDIS_URL).toBe(
      "redis://:generated-secret@localhost:6379/0",
    );
    expect(updates.RPC_INTERNAL_TOKEN).toBe("generated-secret");
  });

  it("syncs REDIS_PASSWORD from an existing Redis URL", () => {
    const values = new Map([
      ["REDIS_URL", "redis://:existing@localhost:6379/0"],
      ["REDIS_PASSWORD", "change-me"],
    ]);
    const updates = applyDefaults(values, {
      compose: true,
      generateSecret: () => "unused",
    });

    expect(updates.REDIS_PASSWORD).toBe("existing");
    expect(updates.REDIS_URL).toBeUndefined();
    expect(updates.RPC_INTERNAL_TOKEN).toBe("unused");
  });

  it("adds an existing REDIS_PASSWORD to the Redis URL", () => {
    const values = new Map([
      ["REDIS_URL", "redis://localhost:6379/0"],
      ["REDIS_PASSWORD", "existing"],
    ]);
    const updates = applyDefaults(values, {
      compose: true,
      generateSecret: () => "unused",
    });

    expect(updates.REDIS_URL).toBe("redis://:existing@localhost:6379/0");
    expect(updates.REDIS_PASSWORD).toBeUndefined();
  });

  it("is idempotent for a complete environment", () => {
    const values = validValues();
    values.set("REDIS_URL", "redis://:password@localhost:6379/0");
    values.set("REDIS_PASSWORD", "password");
    values.set("RPC_INTERNAL_TOKEN", "token");
    values.set("LOG_LEVEL", "info");
    values.set("CACHE_NAMESPACE", "lumi");
    values.set("METRICS_PORT", "9090");
    values.set("DEFAULT_PREFIX", ",");

    expect(applyDefaults(values, { compose: true })).toEqual({});
  });

  it("does not overwrite a valid custom database URL", () => {
    const values = new Map([
      ["DATABASE_URL", "postgresql://custom:secret@db:5432/prod"],
    ]);
    const updates = applyDefaults(values, { compose: false });

    expect(updates.DATABASE_URL).toBeUndefined();
  });

  it("leaves invalid URLs for the validation step instead of hiding them", () => {
    const values = new Map([
      ["DATABASE_URL", "mysql://localhost/lumi"],
      ["REDIS_URL", "http://localhost:6379"],
    ]);
    const updates = applyDefaults(values, { compose: false });

    expect(updates.DATABASE_URL).toBeUndefined();
    expect(updates.REDIS_URL).toBeUndefined();
  });
});

describe("parseArgs", () => {
  it("parses flags and values", () => {
    const options = parseArgs([
      "--yes",
      "--check",
      "--skip-migrate",
      "--token",
      "token-value",
      "--owners=123456789012345678",
      "--database-url",
      "postgresql://localhost/lumi",
      "--redis-url=redis://localhost:6379",
      "--docker",
    ]);

    expect(options.yes).toBe(true);
    expect(options.check).toBe(true);
    expect(options.skipMigrate).toBe(true);
    expect(options.token).toBe("token-value");
    expect(options.owners).toBe("123456789012345678");
    expect(options.databaseUrl).toBe("postgresql://localhost/lumi");
    expect(options.redisUrl).toBe("redis://localhost:6379");
    expect(options.compose).toBe(true);
  });

  it("rejects conflicting or unknown options", () => {
    expect(() => parseArgs(["--start-deps", "--skip-deps"])).toThrow();
    expect(() => parseArgs(["--unknown"])).toThrow();
    expect(() => parseArgs(["--token"])).toThrow();
  });
});

describe("helpers", () => {
  it("detects placeholders without treating real values as placeholders", () => {
    expect(isPlaceholder("")).toBe(true);
    expect(isPlaceholder("change-me")).toBe(true);
    expect(isPlaceholder("replace-me")).toBe(true);
    expect(isPlaceholder("your_bot_token")).toBe(true);
    expect(isPlaceholder("MTIzNDU2Nzg5.GaBcDe.fGhIjKl")).toBe(false);
  });

  it("reads the database URL only from DATABASE_URL", () => {
    expect(databaseUrlFrom(new Map([["DATABASE_URL", validDatabase]]))).toBe(
      validDatabase,
    );
    expect(databaseUrlFrom(new Map([["POSTGRES_URL", validDatabase]]))).toBe(
      "",
    );
    expect(
      redisUrlFrom(
        new Map([
          ["REDIS_HOST", "redis"],
          ["REDIS_PORT", "6380"],
          ["REDIS_DB", "2"],
        ]),
      ),
    ).toBe("redis://redis:6380/2");
  });

  it("redacts credentials from URLs", () => {
    expect(redactUrl("postgresql://user:secret@db:5432/lumi")).not.toContain(
      "secret",
    );
    expect(redactUrl("postgresql://user:secret@db:5432/lumi")).not.toContain(
      "user",
    );
    expect(redactUrl("not a url")).toBe("not a url");
  });
});
