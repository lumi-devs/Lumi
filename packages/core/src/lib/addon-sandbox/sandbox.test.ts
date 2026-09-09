import { beforeEach, describe, expect, it, vi } from "vitest";
import { container } from "@sapphire/framework";
import * as clusterSafe from "#lib/database/cluster-safe.js";
import { ProxyModule } from "./proxy-module.js";
import { DefaultAddonCapabilities } from "@lumi/contracts";
import { childEnv, ownPrefixes } from "./AddonHost.js";
import { callHostMethod } from "./host-methods.js";
import {
  isMethodAllowed,
  parseCapabilities,
  unknownDiscordCapabilities,
} from "./capabilities.js";

const record = { name: "some-addon", dir: "/tmp/some-addon" };

describe("addon child environment", () => {
  it("never hands the addon a credential, whatever is in the host's env", () => {
    const secrets = {
      BOT_TOKEN: "token",
      DATABASE_URL: "postgres://user:pw@host/db",
      REDIS_URL: "redis://host",
      RPC_INTERNAL_TOKEN: "internal",
      AUTH_SECRET: "secret",
    };
    Object.assign(process.env, secrets);
    try {
      const env = childEnv(record);
      for (const key of Object.keys(secrets)) expect(env).not.toHaveProperty(key);
      expect(Object.values(env)).not.toContain("token");
    } finally {
      for (const key of Object.keys(secrets)) delete process.env[key];
    }
  });

  it("is an allowlist, so a newly added secret is excluded without any code change", () => {
    process.env.SOME_FUTURE_SECRET = "leak";
    try {
      expect(childEnv(record)).not.toHaveProperty("SOME_FUTURE_SECRET");
    } finally {
      delete process.env.SOME_FUTURE_SECRET;
    }
  });

  it("tells the child which addon it is", () => {
    const env = childEnv(record);
    expect(env.LUMI_ADDON_NAME).toBe("some-addon");
    expect(env.LUMI_ADDON_DIR).toBe("/tmp/some-addon");
  });
});

describe("capability gate", () => {
  it("gives an addon that declares nothing only reply and its own KV", () => {
    const caps = DefaultAddonCapabilities;
    expect(isMethodAllowed("ctx.reply", caps)).toBe(true);
    expect(isMethodAllowed("kv.set", caps)).toBe(true);
    expect(isMethodAllowed("discord.channels.send", caps)).toBe(false);
    expect(isMethodAllowed("redis.sadd", caps)).toBe(false);
    expect(isMethodAllowed("schedule.add", caps)).toBe(false);
  });

  it("always allows reading your own config and writing your own log line", () => {
    const caps = parseCapabilities({ discord: [], kv: false });
    expect(isMethodAllowed("config.get", caps)).toBe(true);
    expect(isMethodAllowed("log", caps)).toBe(true);
    expect(isMethodAllowed("kv.get", caps)).toBe(false);
  });

  it("grants exactly what the manifest declares, and nothing adjacent", () => {
    const caps = parseCapabilities({ discord: ["sendMessage"], redis: true });
    expect(isMethodAllowed("discord.channels.send", caps)).toBe(true);
    expect(isMethodAllowed("discord.messages.edit", caps)).toBe(false);
    expect(isMethodAllowed("redis.smembers", caps)).toBe(true);
    expect(isMethodAllowed("schedule.add", caps)).toBe(false);
  });

  it("drops capability names it does not recognise instead of trusting them", () => {
    const caps = parseCapabilities({ discord: ["sendMessage", "becomeAdmin"] });
    expect(caps.discord).toEqual(["sendMessage"]);
    expect(unknownDiscordCapabilities({ discord: ["sendMessage", "becomeAdmin"] })).toEqual([
      "becomeAdmin",
    ]);
  });

  it("refuses a method that is not in the table at all", () => {
    expect(
      isMethodAllowed("kv.dropEverything" as never, { discord: [], kv: true }),
    ).toBe(false);
  });
});

describe("addon GDPR erasure", () => {
  const kv = {
    deleteModuleDataForTarget: vi.fn().mockResolvedValue(3),
    listModuleDataForTarget: vi.fn().mockResolvedValue([]),
  };
  const pipeline = { srem: vi.fn(), exec: vi.fn().mockResolvedValue([[null, 1], [null, 0]]) };

  function installHost() {
    (container as any).db = { guildKV: kv };
    (container as any).redis = { pipeline: () => pipeline, scan: vi.fn() };
    (container as any).logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  }

  function proxyFor(name: string): ProxyModule {
    const store = { name: "modules" } as never;
    return new ProxyModule({ name, path: "/x", root: "/x", store }, { name });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    installHost();
  });

  it("erases the addon's own rows without asking the addon, which may not be running", async () => {
    vi.spyOn(clusterSafe, "scanKeysSafe").mockResolvedValue([
      "lumi:addon:giveaway:g1:entries",
      "lumi:addon:giveaway:g2:entries",
    ]);

    await proxyFor("giveaway").deleteUserData("user-1");

    expect(kv.deleteModuleDataForTarget).toHaveBeenCalledWith("giveaway", "user-1");
    expect(pipeline.srem).toHaveBeenCalledWith("lumi:addon:giveaway:g1:entries", "user-1");
    expect(pipeline.srem).toHaveBeenCalledWith("lumi:addon:giveaway:g2:entries", "user-1");
  });

  it("only ever sweeps the calling addon's own namespaces", async () => {
    const scan = vi.spyOn(clusterSafe, "scanKeysSafe").mockResolvedValue([]);

    await proxyFor("tag-manager").deleteUserData("user-1");

    expect(scan).toHaveBeenCalledWith(expect.anything(), "lumi:addon:tag-manager:*");
    expect(kv.deleteModuleDataForTarget).toHaveBeenCalledWith("tag-manager", "user-1");
  });

  it("omits an addon from the export when it holds nothing for the user", async () => {
    vi.spyOn(clusterSafe, "scanKeysSafe").mockResolvedValue([]);
    expect(await proxyFor("tag-manager").exportUserData("user-1")).toBeNull();

    kv.listModuleDataForTarget.mockResolvedValueOnce([{ guildId: "g", key: "k", value: 1 }]);
    expect(await proxyFor("tag-manager").exportUserData("user-1")).toEqual({
      moduleData: [{ guildId: "g", key: "k", value: 1 }],
    });
  });
});

describe("interaction prefix ownership", () => {
  beforeEach(() => {
    (container as any).logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
  });

  it("ignores an empty prefix, which would otherwise capture every interaction in the bot", () => {
    expect(ownPrefixes("giveaway", ["", "giveaway:enter"])).toEqual(["giveaway:enter"]);
  });

  it("refuses a prefix belonging to another addon or to core", () => {
    expect(ownPrefixes("evil", ["tempvc:", "giveaway:reroll:", "evil:ok"])).toEqual(["evil:ok"]);
  });

  it("requires the addon's own name, not merely a prefix of it", () => {
    expect(ownPrefixes("tag", ["tag-manager:x"])).toEqual([]);
    expect(ownPrefixes("tag", ["tag:x"])).toEqual(["tag:x"]);
  });
});

describe("guild scoping", () => {
  const config = { getModuleConfig: vi.fn().mockResolvedValue("v") };

  beforeEach(() => {
    vi.clearAllMocks();
    (container as any).db = { config };
    (container as any).logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
  });

  it("pins a call to the guild the invocation came from", async () => {
    await callHostMethod(
      { id: "1", action: "config.get", data: { key: "k" } },
      { moduleName: "a", guildId: "guild-1" },
    );
    expect(config.getModuleConfig).toHaveBeenCalledWith("guild-1", "a", "k");
  });

  it("refuses a guild the addon was not invoked in", async () => {
    await expect(
      callHostMethod(
        { id: "1", action: "config.get", data: { key: "k", guildId: "guild-2" } },
        { moduleName: "a", guildId: "guild-1" },
      ),
    ).rejects.toThrow(/tried to reach guild guild-2/);
  });

  it("rejects a method that is not its own property", () => {
    expect(() =>
      callHostMethod({ id: "1", action: "constructor" as never }, { moduleName: "a" }),
    ).toThrow(/Unknown addon method/);
  });
});
