import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const client: Record<string, Mock> = {
    setFromMessage: vi.fn(),
    setText: vi.fn(),
    setAvatar: vi.fn(),
    setUsername: vi.fn(),
    setDisplayName: vi.fn(),
    setWatermark: vi.fn(),
    setTheme: vi.fn(),
    toBuffer: vi.fn(async () => Buffer.from("png")),
  };

  for (const [name, method] of Object.entries(client)) {
    if (name !== "toBuffer") method.mockReturnValue(client);
  }

  return {
    client,
    MiQ: vi.fn(function FakeMiQ() {
      return client;
    }),
    stripDiscordMarkdown: vi.fn((text: string) => text.replace(/\*\*/g, "")),
  };
});

vi.mock("makeitaquote", () => ({
  MiQ: mocks.MiQ,
  stripDiscordMarkdown: mocks.stripDiscordMarkdown,
}));

import { defaultQuoteRenderer } from "../render.js";

const baseOptions = {
  color: false,
  watermark: "Make it a Quote",
  nameSource: "nickname" as const,
  avatarSource: "guild" as const,
  stripMarkdown: false,
  resolveMentions: true,
};

function textInput(overrides: Partial<typeof baseOptions> = {}) {
  return {
    kind: "text" as const,
    text: "**Hello**",
    username: "lumi",
    displayName: "Lumi",
    avatarUrl: "https://example.com/avatar.png",
    options: { ...baseOptions, ...overrides },
  };
}

function messageInput(overrides: Partial<typeof baseOptions> = {}) {
  return {
    kind: "message" as const,
    message: { content: "**Hello**" } as never,
    options: { ...baseOptions, ...overrides },
  };
}

describe("defaultQuoteRenderer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps color to an explicit grayscale theme", async () => {
    await defaultQuoteRenderer.render(textInput({ color: true }));
    expect(mocks.client.setTheme).toHaveBeenLastCalledWith({
      avatar: { grayscale: false },
    });

    await defaultQuoteRenderer.render(textInput({ color: false }));
    expect(mocks.client.setTheme).toHaveBeenLastCalledWith({
      avatar: { grayscale: true },
    });
  });

  it("maps stripMarkdown to Discord markdown handling for messages", async () => {
    await defaultQuoteRenderer.render(messageInput({ stripMarkdown: true }));
    expect(mocks.client.setFromMessage).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ markdown: false }),
    );

    await defaultQuoteRenderer.render(messageInput({ stripMarkdown: false }));
    expect(mocks.client.setFromMessage).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ markdown: "raw" }),
    );
  });

  it("strips Discord markdown from text quotes when enabled", async () => {
    await defaultQuoteRenderer.render(textInput({ stripMarkdown: true }));
    expect(mocks.stripDiscordMarkdown).toHaveBeenCalledWith("**Hello**");
    expect(mocks.client.setText).toHaveBeenLastCalledWith("Hello");
  });

  it("omits an empty watermark", async () => {
    await defaultQuoteRenderer.render(textInput({ watermark: "  " }));
    expect(mocks.client.setWatermark).not.toHaveBeenCalled();
  });
});
