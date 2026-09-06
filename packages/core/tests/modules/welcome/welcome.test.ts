import { describe, it, expect, vi, beforeEach } from "vitest";
import { MessageFlags } from "discord.js";
import {
  buildDmWelcomeCard,
  buildGoodbyeCard,
  buildWelcomeCard,
  renderWelcomeTemplate,
  templateVarsFor,
  type WelcomeTemplateVars,
} from "#modules/welcome/lib/template.js";
import {
  WelcomeDefaults,
  loadWelcomeConfig,
} from "#modules/welcome/lib/config.js";
import { sendWelcomeCard } from "#modules/welcome/lib/send.js";
import { WelcomeMemberAddListener } from "#modules/welcome/listeners/guildMemberAdd.js";
import { WelcomeMemberRemoveListener } from "#modules/welcome/listeners/guildMemberRemove.js";
import { container } from "@sapphire/framework";

beforeEach(() => {
  vi.clearAllMocks();
  (container as any).db = {
    config: {
      getModuleConfig: vi.fn().mockResolvedValue(null),
    },
  };
  (container as any).logger = {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  };
});

const vars: WelcomeTemplateVars = {
  user: "<@123>",
  username: "alex",
  nickname: "Al",
  server: "Acme",
  memberCount: 42,
};

function mockGetModuleConfig(values: Record<string, unknown>) {
  (container.db.config.getModuleConfig as any).mockImplementation(
    (_guildId: string, _module: string, key: string) => values[key] ?? null,
  );
}

describe("renderWelcomeTemplate", () => {
  it("substitutes every known placeholder", () => {
    expect(
      renderWelcomeTemplate(
        "Welcome {user} ({username}) to {server}! You are #{memberCount}.",
        vars,
      ),
    ).toBe("Welcome <@123> (alex) to Acme! You are #42.");
  });

  it("leaves unknown placeholders verbatim", () => {
    expect(
      renderWelcomeTemplate("See {rules} and meet {user}. {member_count}!", vars),
    ).toBe("See {rules} and meet <@123>. {member_count}!");
  });

  it("replaces repeated placeholders", () => {
    expect(renderWelcomeTemplate("{username} aka {username}", vars)).toBe(
      "alex aka alex",
    );
  });

  it("substitutes the nickname and memberNumber alias", () => {
    expect(renderWelcomeTemplate("{nickname} is #{memberNumber}", vars)).toBe(
      "Al is #42",
    );
  });

  it("leaves text without placeholders untouched", () => {
    expect(renderWelcomeTemplate("Hello there.", vars)).toBe("Hello there.");
  });

  it("renders an empty template as empty", () => {
    expect(renderWelcomeTemplate("", vars)).toBe("");
  });
});

describe("templateVarsFor", () => {
  it("builds a mention for the user placeholder", () => {
    expect(templateVarsFor("123", "alex", "Al", "Acme", 7)).toEqual({
      user: "<@123>",
      username: "alex",
      nickname: "Al",
      server: "Acme",
      memberCount: 7,
    });
  });

  it("falls back to the username when there is no nickname", () => {
    expect(templateVarsFor("123", "alex", null, "Acme", 7)).toEqual({
      user: "<@123>",
      username: "alex",
      nickname: "alex",
      server: "Acme",
      memberCount: 7,
    });
  });
});

describe("loadWelcomeConfig", () => {
  it("falls back to defaults when nothing is stored", async () => {
    mockGetModuleConfig({});
    const config = await loadWelcomeConfig("guild-1");
    expect(config).toEqual({
      welcomeEnabled: WelcomeDefaults.welcomeEnabled,
      welcomeChannel: null,
      welcomeTemplate: WelcomeDefaults.welcomeTemplate,
      goodbyeEnabled: WelcomeDefaults.goodbyeEnabled,
      goodbyeChannel: null,
      goodbyeTemplate: WelcomeDefaults.goodbyeTemplate,
      autoRoles: [],
      dmWelcomeEnabled: WelcomeDefaults.dmWelcomeEnabled,
      dmWelcomeTemplate: WelcomeDefaults.dmWelcomeTemplate,
    });
  });

  it("returns stored values when present", async () => {
    mockGetModuleConfig({
      welcomeEnabled: false,
      welcomeChannel: "111111111111111111",
      welcomeTemplate: "Hi {user}",
      goodbyeEnabled: true,
      goodbyeChannel: "222222222222222222",
      goodbyeTemplate: "Bye {username}",
      autoRoles: ["333333333333333333"],
      dmWelcomeEnabled: true,
      dmWelcomeTemplate: "Hey {username}",
    });
    const config = await loadWelcomeConfig("guild-1");
    expect(config.welcomeEnabled).toBe(false);
    expect(config.welcomeChannel).toBe("111111111111111111");
    expect(config.welcomeTemplate).toBe("Hi {user}");
    expect(config.goodbyeEnabled).toBe(true);
    expect(config.goodbyeChannel).toBe("222222222222222222");
    expect(config.goodbyeTemplate).toBe("Bye {username}");
    expect(config.autoRoles).toEqual(["333333333333333333"]);
    expect(config.dmWelcomeEnabled).toBe(true);
    expect(config.dmWelcomeTemplate).toBe("Hey {username}");
  });

  it("drops non-string auto-role entries and empty templates", async () => {
    mockGetModuleConfig({
      autoRoles: ["444444444444444444", 42, null],
      welcomeTemplate: "",
    });
    const config = await loadWelcomeConfig("guild-1");
    expect(config.autoRoles).toEqual(["444444444444444444"]);
    expect(config.welcomeTemplate).toBe(WelcomeDefaults.welcomeTemplate);
  });
});

describe("welcome card builders", () => {
  it("builds V2 component payloads", () => {
    for (const card of [
      buildWelcomeCard("Hello"),
      buildGoodbyeCard("Bye"),
      buildDmWelcomeCard("Acme", "Hey"),
    ]) {
      expect(card.flags).toBe(MessageFlags.IsComponentsV2);
      expect(card.components).toHaveLength(1);
    }
  });

  it("attaches the auto-role line as a footer only when given", () => {
    expect(buildWelcomeCard("Hello", undefined)).not.toHaveProperty("footer");
    const withRoles = buildWelcomeCard("Hello", "Auto-roles: <@&1>");
    expect(JSON.stringify(withRoles)).toContain("Auto-roles: <@&1>");
  });
});

describe("sendWelcomeCard", () => {
  it("sends to a sendable channel and reports success", async () => {
    const send = vi.fn().mockResolvedValue({ id: "m1" });
    const guild = {
      channels: {
        fetch: vi.fn().mockResolvedValue({ isSendable: () => true, send }),
      },
    } as any;
    await expect(
      sendWelcomeCard(guild, "111", buildWelcomeCard("Hi"), "ctx"),
    ).resolves.toBe(true);
    expect(send).toHaveBeenCalledOnce();
  });

  it("returns false when the channel is missing or not sendable", async () => {
    const missing = {
      channels: { fetch: vi.fn().mockResolvedValue(null) },
    } as any;
    await expect(
      sendWelcomeCard(missing, "111", buildWelcomeCard("Hi"), "ctx"),
    ).resolves.toBe(false);

    const notSendable = {
      channels: {
        fetch: vi.fn().mockResolvedValue({ isSendable: () => false }),
      },
    } as any;
    await expect(
      sendWelcomeCard(notSendable, "111", buildWelcomeCard("Hi"), "ctx"),
    ).resolves.toBe(false);
  });

  it("returns false and logs when sending fails", async () => {
    const send = vi.fn().mockRejectedValue(new Error("no perms"));
    const guild = {
      channels: {
        fetch: vi.fn().mockResolvedValue({ isSendable: () => true, send }),
      },
    } as any;
    await expect(
      sendWelcomeCard(guild, "111", buildWelcomeCard("Hi"), "ctx"),
    ).resolves.toBe(false);
    expect(container.logger.error).toHaveBeenCalled();
  });
});

describe("welcome listener wiring", () => {
  it("gates the join listener on the welcome module", () => {
    const listener = new WelcomeMemberAddListener({} as any, {
      name: "welcomeMemberAdd",
      module: "welcome",
    });
    expect(listener.name).toBe("welcomeMemberAdd");
    expect(listener.module).toBe("welcome");
  });

  it("gates the leave listener on the welcome module", () => {
    const listener = new WelcomeMemberRemoveListener({} as any, {
      name: "welcomeMemberRemove",
      module: "welcome",
    });
    expect(listener.name).toBe("welcomeMemberRemove");
    expect(listener.module).toBe("welcome");
  });
});
