import { readFileSync } from "node:fs";
import type { ModuleServices } from "@lumi/module-kit";
import { validateManifest } from "@lumi/module-runtime";
import type { Guild, Message } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { QuoteConfigSchema } from "../config.js";
import { QuoteRequirement } from "../constants.js";
import {
  extractQuoteText,
  parseMessageReference,
  resolveTextMentions,
  stripQuoteInvocation,
} from "../reference.js";
import type { QuoteRenderer } from "../render.js";
import { executeQuote, type PrefixAwareInteraction } from "../service.js";

const manifest = JSON.parse(
  readFileSync(new URL("../manifest.json", import.meta.url), "utf8"),
);

function fakeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: "message",
    guildId: "guild",
    content: "hello",
    author: {
      id: "author",
      username: "author",
      globalName: "Author",
      displayAvatarURL: () => "https://example.com/author.png",
    },
    member: {
      displayName: "Author",
      displayAvatarURL: () => "https://example.com/member.png",
    },
    attachments: new Map(),
    embeds: [],
    reference: null,
    react: vi.fn(async () => undefined),
    fetchReference: vi.fn(async () => null),
    ...overrides,
  } as unknown as Message;
}

function fakeServices(config: unknown = {}) {
  return {
    modules: { isEnabled: vi.fn(() => true) },
    config: { get: vi.fn(async () => config) },
    observability: { logger: { warn: vi.fn(), error: vi.fn() } },
  } as unknown as ModuleServices;
}

function fakeInteraction(
  options: {
    strings?: Record<string, string | null>;
    userOption?: unknown;
    sourceMessage?: Message;
    prefix?: string;
    channel?: unknown;
    client?: unknown;
    guild?: unknown;
  } = {},
) {
  const replies: unknown[] = [];
  const lastReply = { ref: null as Message | null };
  const interaction = {
    guildId: "guild",
    channelId: "channel",
    channel:
      options.channel ??
      ({
        id: "channel",
        isTextBased: () => true,
        messages: { fetch: vi.fn() },
      } as unknown),
    client:
      options.client ??
      ({
        user: { id: "bot" },
        channels: { fetch: vi.fn(async () => null) },
      } as unknown),
    guild: options.guild ?? ({ members: { cache: new Map() } } as unknown),
    user: {
      id: "user",
      username: "tester",
      globalName: "Tester",
      displayAvatarURL: () => "https://example.com/user.png",
    },
    options: {
      getString: (name: string) => options.strings?.[name] ?? null,
      getUser: () => options.userOption ?? null,
    },
    reply: vi.fn(async (payload: unknown) => {
      replies.push(payload);
      const msg = {
        id: "reply-msg",
        channelId: "channel",
        guildId: "guild",
        author: { id: "bot" },
        reply: vi.fn(),
      } as unknown as Message;
      lastReply.ref = msg;
      return msg;
    }),
    fetchReply: vi.fn(async () => {
      return (
        lastReply.ref ??
        ({
          id: "reply-msg",
          channelId: "channel",
          guildId: "guild",
          author: { id: "bot" },
          reply: vi.fn(),
        } as unknown as Message)
      );
    }),
    sourceMessage: options.sourceMessage,
    prefix: options.prefix,
  };

  return {
    interaction: interaction as unknown as PrefixAwareInteraction,
    replies,
  };
}

function fakeRenderer() {
  return {
    render: vi.fn(async () => Buffer.from("png")),
  };
}

function quotePayload(value: unknown): { files: unknown[] } {
  if (
    value &&
    typeof value === "object" &&
    "files" in value &&
    Array.isArray(value.files)
  ) {
    return { files: value.files };
  }
  throw new Error("Expected a quote payload with files");
}

describe("quote config", () => {
  it("defaults to the dark theme and the current channel", () => {
    const config = QuoteConfigSchema.parse({});
    expect(config.theme).toBe("dark");
    expect(config.channelId).toBeNull();
    expect(config.watermark).toBe("Make it a Quote");
    expect(config.stripMarkdown).toBe(false);
    expect(config.resolveMentions).toBe(true);
  });
});

describe("quote references", () => {
  it("parses Discord message links and raw IDs", () => {
    expect(parseMessageReference("https://discord.com/channels/1/2/3")).toEqual(
      { guildId: "1", channelId: "2", messageId: "3" },
    );
    expect(parseMessageReference("123456789012345678")).toEqual({
      guildId: null,
      channelId: null,
      messageId: "123456789012345678",
    });
    expect(parseMessageReference("not a message")).toBeNull();
  });

  it("strips quote and q invocations", () => {
    expect(stripQuoteInvocation(",quote hello", ",")).toBe("hello");
    expect(stripQuoteInvocation(",q hello", ",")).toBe("hello");
    expect(stripQuoteInvocation(",rank", ",")).toBe("");
    expect(stripQuoteInvocation("hello", ",")).toBe("");
  });

  it("resolves user, role, and channel mentions in text", () => {
    const guild = {
      members: { cache: new Map([["1", { displayName: "Alice" }]]) },
      roles: { cache: new Map([["2", { name: "Mods" }]]) },
      channels: { cache: new Map([["3", { name: "general" }]]) },
    } as unknown as Guild;

    expect(resolveTextMentions("<@1> <@&2> <#3>", guild)).toBe(
      "@Alice @Mods #general",
    );
    expect(resolveTextMentions("<@9> <@&8> <#7>", guild)).toBe("@9 @8 #7");
    expect(resolveTextMentions("<@1>", null)).toBe("<@1>");
  });

  it("falls back to attachment URLs and embeds for empty messages", () => {
    expect(extractQuoteText(fakeMessage({ content: "  hi  " }))).toBe("hi");
    expect(
      extractQuoteText(
        fakeMessage({
          content: "",
          attachments: new Map([
            ["one", { url: "https://example.com/image.png" }],
          ]),
        }),
      ),
    ).toBe("https://example.com/image.png");
    expect(
      extractQuoteText(
        fakeMessage({
          content: "",
          embeds: [{ title: "Title", description: "Body" }],
        }),
      ),
    ).toBe("Title\nBody");
  });

  it("declares the renderer as an installable requirement", () => {
    const parsed = validateManifest(manifest);
    expect(parsed.requirements).toContain(QuoteRequirement);
  });
});

describe("executeQuote integration", () => {
  it("posts a text quote in the current channel when no channel is configured", async () => {
    const renderer = fakeRenderer();
    const { interaction, replies } = fakeInteraction({
      strings: { text: "hello world" },
    });

    await executeQuote({
      interaction,
      services: fakeServices(),
      renderer,
    });

    expect(renderer.render).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "text",
        text: "hello world",
        username: "tester",
        displayName: "Tester",
        options: expect.objectContaining({
          color: false,
          watermark: "Make it a Quote",
        }),
      }),
    );
    expect(replies).toHaveLength(1);
    expect(quotePayload(replies[0]).files).toHaveLength(1);
  });

  it("quotes a replied message and posts it to the configured channel", async () => {
    const target = {
      id: "quotes",
      isSendable: () => true,
      send: vi.fn(async (_payload: unknown) => undefined),
    };
    const client = {
      user: { id: "bot" },
      channels: { fetch: vi.fn(async () => target) },
    };
    const replied = fakeMessage({ content: "quoted text" });
    const source = fakeMessage({
      content: ",quote",
      reference: { messageId: "quoted" },
      fetchReference: vi.fn(async () => replied),
    });
    const renderer = fakeRenderer();
    const { interaction, replies } = fakeInteraction({
      sourceMessage: source,
      prefix: ",",
      client,
    });

    await executeQuote({
      interaction,
      services: fakeServices({ channelId: "quotes", theme: "color" }),
      renderer,
    });

    expect(renderer.render).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "message",
        message: replied,
        options: expect.objectContaining({ color: true }),
      }),
    );
    expect(target.send).toHaveBeenCalledOnce();
    expect(source.react).toHaveBeenCalledWith("✅");
    expect(replies).toHaveLength(0);
    expect(quotePayload(target.send.mock.calls[0]?.[0]).files).toHaveLength(1);
  });

  it("supports the q alias and text after the prefix", async () => {
    const renderer = fakeRenderer();
    const source = fakeMessage({ content: ",q hello there" });
    const { interaction, replies } = fakeInteraction({
      sourceMessage: source,
      prefix: ",",
    });

    await executeQuote({
      interaction,
      services: fakeServices({ theme: "color" }),
      renderer,
    });

    expect(renderer.render).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "text",
        text: "hello there",
        options: expect.objectContaining({ color: true }),
      }),
    );
    expect(replies).toHaveLength(1);
  });

  it("rejects message links from another server", async () => {
    const renderer = fakeRenderer();
    const { interaction, replies } = fakeInteraction({
      strings: {
        message: "https://discord.com/channels/other/222/333",
      },
    });

    await executeQuote({
      interaction,
      services: fakeServices(),
      renderer,
    });

    expect(renderer.render).not.toHaveBeenCalled();
    expect(replies).toHaveLength(1);
  });

  it("reports a missing renderer without leaking the error", async () => {
    const renderer = {
      render: vi.fn(async () => {
        throw new Error("Cannot find package 'makeitaquote'");
      }),
    } as unknown as QuoteRenderer;
    const { interaction, replies } = fakeInteraction({
      strings: { text: "hello" },
    });

    await executeQuote({
      interaction,
      services: fakeServices(),
      renderer,
    });

    expect(replies).toHaveLength(1);
    expect(JSON.stringify(replies[0])).not.toContain("Cannot find package");
  });
});
