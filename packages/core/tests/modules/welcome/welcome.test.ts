import { describe, it, expect, vi, beforeEach } from "bun:test";
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
  WelcomeTemplateDocs,
  GoodbyeTemplateDocs,
  DmTemplateDocs,
  loadWelcomeConfig,
} from "#modules/welcome/lib/config.js";
import { sendWelcomeCard } from "#modules/welcome/lib/send.js";
import {
  MessageContentSchema,
  MessageTemplateDocs,
  MessageTemplateVars,
  renderMessageContent,
} from "#lib/message-content.js";
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
  userId: "123",
  username: "alex",
  nickname: "Al",
  userAvatarUrl: "https://cdn.discordapp.com/embed/avatars/0.png",
  server: "Acme",
  serverId: "999",
  serverIconUrl: "https://cdn.discordapp.com/embed/avatars/1.png",
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
    expect(
      templateVarsFor(
        "123",
        "alex",
        "Al",
        "https://cdn.discordapp.com/embed/avatars/0.png",
        "Acme",
        "999",
        "https://cdn.discordapp.com/embed/avatars/1.png",
        7,
      ),
    ).toEqual({
      user: "<@123>",
      userId: "123",
      username: "alex",
      nickname: "Al",
      userAvatarUrl: "https://cdn.discordapp.com/embed/avatars/0.png",
      server: "Acme",
      serverId: "999",
      serverIconUrl: "https://cdn.discordapp.com/embed/avatars/1.png",
      memberCount: 7,
    });
  });

  it("falls back to the username when there is no nickname", () => {
    expect(
      templateVarsFor(
        "123",
        "alex",
        null,
        "https://cdn.discordapp.com/embed/avatars/0.png",
        "Acme",
        "999",
        "https://cdn.discordapp.com/embed/avatars/1.png",
        7,
      ),
    ).toEqual({
      user: "<@123>",
      userId: "123",
      username: "alex",
      nickname: "alex",
      userAvatarUrl: "https://cdn.discordapp.com/embed/avatars/0.png",
      server: "Acme",
      serverId: "999",
      serverIconUrl: "https://cdn.discordapp.com/embed/avatars/1.png",
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
      welcomeAccentColor: null,
      welcomeThumbnailUrl: null,
      welcomeImageUrls: [],
      welcomeFooter: null,
      welcomeRichContent: { blocks: [] },
      goodbyeEnabled: WelcomeDefaults.goodbyeEnabled,
      goodbyeChannel: null,
      goodbyeTemplate: WelcomeDefaults.goodbyeTemplate,
      goodbyeRichContent: { blocks: [] },
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
      welcomeAccentColor: "#5865F2",
      welcomeImageUrls: ["https://example.com/a.png", 42],
      welcomeFooter: "Enjoy {server}",
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
    expect(config.welcomeAccentColor).toBe("#5865F2");
    expect(config.welcomeImageUrls).toEqual(["https://example.com/a.png"]);
    expect(config.welcomeFooter).toBe("Enjoy {server}");
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

  it("passes rich accent, gallery, buttons and footer through to the payload", () => {
    const card = buildWelcomeCard("Hello", undefined, {
      accentColor: "#5865F2",
      imageUrls: ["https://example.com/a.png"],
      footer: "Enjoy your stay",
      buttons: [{ label: "Rules", url: "https://example.com/rules" }],
    });
    const json = JSON.stringify(card);
    expect(json).toContain("5793266");
    expect(json).toContain("https://example.com/a.png");
    expect(json).toContain("Enjoy your stay");
    expect(json).toContain("Rules");
    expect(json).toContain("https://example.com/rules");
  });
});

describe("message template vars", () => {
  it("exposes one canonical list covering every placeholder", () => {
    expect(MessageTemplateVars.map((v) => v.name)).toEqual([
      "user",
      "username",
      "nickname",
      "server",
      "memberCount",
      "memberNumber",
    ]);
  });

  it("is the single source for the welcome placeholder docs", () => {
    expect(WelcomeTemplateDocs).toBe(MessageTemplateDocs);
    expect(GoodbyeTemplateDocs).toBe(MessageTemplateDocs);
    expect(DmTemplateDocs).toBe(MessageTemplateDocs);
  });
});

describe("renderMessageContent", () => {
  it("substitutes vars and assembles accent, gallery, buttons and footer", () => {
    const card = renderMessageContent(
      {
        text: "Hi {username}",
        accentColor: "#5865F2",
        imageUrls: ["https://example.com/a.png"],
        footer: "Bye {username}",
        buttons: [{ label: "Rules", url: "https://example.com/rules" }],
      },
      { username: "alex" },
      "Welcome",
    );
    expect(card.flags).toBe(MessageFlags.IsComponentsV2);
    const json = JSON.stringify(card);
    expect(json).toContain("Hi alex");
    expect(json).toContain("5793266");
    expect(json).toContain("https://example.com/a.png");
    expect(json).toContain("Bye alex");
    expect(json).toContain("Rules");
    expect(json).toContain("https://example.com/rules");
  });

  it("falls back to the default accent on invalid hex", () => {
    const card = renderMessageContent(
      { text: "Hi", accentColor: "not-a-color" },
      {},
      "Welcome",
    );
    const json = JSON.stringify(card);
    expect(json).toContain("Hi");
    expect(json).not.toContain("not-a-color");
  });

  it("rejects invalid hex, oversized galleries and too many buttons", () => {
    expect(() =>
      MessageContentSchema.parse({ text: "Hi", accentColor: "red" }),
    ).toThrow();
    expect(() =>
      MessageContentSchema.parse({
        text: "Hi",
        imageUrls: Array.from(
          { length: 11 },
          (_, i) => `https://example.com/${i}.png`,
        ),
      }),
    ).toThrow();
    expect(() =>
      MessageContentSchema.parse({
        text: "Hi",
        buttons: Array.from({ length: 6 }, (_, i) => ({
          label: `B${i}`,
          url: "https://example.com/",
        })),
      }),
    ).toThrow();
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
    expect(send).toHaveBeenCalledTimes(1);
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
