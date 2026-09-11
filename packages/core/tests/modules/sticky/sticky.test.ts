import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@sapphire/framework";
import {
  delStickyMessageId,
  getStickyMessageId,
  isStickyOnCooldown,
  setStickyMessageId,
  StickyCooldownMs,
  stickyKey,
} from "#modules/sticky/lib/sticky-store.js";
import { StickyMessageListener } from "#modules/sticky/listeners/messageCreate.js";

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    author: { bot: false, id: "user-1" },
    guildId: "guild-1",
    channelId: "channel-1",
    channel: {
      send: vi.fn().mockResolvedValue({ id: "new-1" }),
      messages: { delete: vi.fn().mockResolvedValue(undefined) },
    },
    ...overrides,
  };
}

describe("Sticky Module", () => {
  let listener: StickyMessageListener;

  beforeEach(() => {
    vi.clearAllMocks();
    (container as any).redis = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
    };
    (container as any).db = {
      config: { getModuleConfig: vi.fn().mockResolvedValue(null) },
    };
    (container as any).logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    listener = new StickyMessageListener(
      {
        name: "stickyMessageCreate",
        path: "/path/to/modules/sticky/listeners/messageCreate.ts",
        root: "/path/to/modules",
        store: { name: "listeners" } as any,
      },
      { module: "sticky" },
    );
  });

  describe("stickyKey", () => {
    it("should build the sticky key as lumi:sticky:{guildId}:{channelId}", () => {
      expect(stickyKey("g1", "c1")).toBe("lumi:sticky:g1:c1");
      expect(StickyCooldownMs).toBe(1000);
    });
  });

  describe("sticky store", () => {
    it("should get, set and delete through the sticky key", async () => {
      (container.redis.get as any).mockResolvedValue("msg-9");
      expect(await getStickyMessageId("g1", "c1")).toBe("msg-9");
      expect(container.redis.get).toHaveBeenCalledWith("lumi:sticky:g1:c1");

      await setStickyMessageId("g1", "c1", "msg-10");
      expect(container.redis.set).toHaveBeenCalledWith(
        "lumi:sticky:g1:c1",
        "msg-10",
      );

      await delStickyMessageId("g1", "c1");
      expect(container.redis.del).toHaveBeenCalledWith("lumi:sticky:g1:c1");
    });
  });

  describe("isStickyOnCooldown", () => {
    it("should allow the first post then block reposts within 1s", () => {
      expect(isStickyOnCooldown("g-cd", "c-cd", 1000)).toBe(false);
      expect(isStickyOnCooldown("g-cd", "c-cd", 1000)).toBe(true);
      expect(isStickyOnCooldown("g-cd", "c-cd", 1500)).toBe(true);
      expect(isStickyOnCooldown("g-cd", "c-cd", 2001)).toBe(false);
    });
  });

  describe("StickyMessageListener", () => {
    it("should skip messages from bots without touching config", async () => {
      const message = makeMessage({ author: { bot: true, id: "bot-1" } });
      await (listener as any).handle(message);
      expect(container.db.config.getModuleConfig).not.toHaveBeenCalled();
      expect(message.channel.send).not.toHaveBeenCalled();
    });

    it("should delete the old sticky, post the new one and store its id", async () => {
      (container.db.config.getModuleConfig as any).mockResolvedValue([
        { channel_id: "channel-1", message: "stay", enabled: true },
      ]);
      (container.redis.get as any).mockResolvedValue("old-1");
      const message = makeMessage();
      await (listener as any).handle(message);
      expect(message.channel.messages.delete).toHaveBeenCalledWith("old-1");
      expect(message.channel.send).toHaveBeenCalledTimes(1);
      expect(
        JSON.stringify(message.channel.send.mock.calls[0][0]),
      ).toContain("stay");
      expect(container.redis.set).toHaveBeenCalledWith(
        "lumi:sticky:guild-1:channel-1",
        "new-1",
      );
    });

    it("should do nothing when no entry matches the channel", async () => {
      (container.db.config.getModuleConfig as any).mockResolvedValue([
        { channel_id: "other", message: "stay", enabled: true },
      ]);
      const message = makeMessage();
      await (listener as any).handle(message);
      expect(message.channel.send).not.toHaveBeenCalled();
    });

    it("should ignore disabled entries", async () => {
      (container.db.config.getModuleConfig as any).mockResolvedValue([
        { channel_id: "channel-1", message: "stay", enabled: false },
      ]);
      const message = makeMessage();
      await (listener as any).handle(message);
      expect(message.channel.send).not.toHaveBeenCalled();
    });

    it("should pass entry accent and images through to the card payload", async () => {
      (container.db.config.getModuleConfig as any).mockResolvedValue([
        {
          channel_id: "channel-rich",
          message: "stay rich",
          enabled: true,
          accentColor: "#5865F2",
          imageUrls: ["https://example.com/a.png"],
        },
      ]);
      (container.redis.get as any).mockResolvedValue(null);
      const message = makeMessage({ channelId: "channel-rich" });
      await (listener as any).handle(message);
      expect(message.channel.send).toHaveBeenCalledTimes(1);
      const json = JSON.stringify(message.channel.send.mock.calls[0][0]);
      expect(json).toContain("stay rich");
      expect(json).toContain("5793266");
      expect(json).toContain("https://example.com/a.png");
    });

    it("should fall back to the default accent on invalid hex", async () => {
      (container.db.config.getModuleConfig as any).mockResolvedValue([
        {
          channel_id: "channel-badhex",
          message: "stay plain",
          enabled: true,
          accentColor: "not-a-color",
        },
      ]);
      (container.redis.get as any).mockResolvedValue(null);
      const message = makeMessage({ channelId: "channel-badhex" });
      await (listener as any).handle(message);
      expect(message.channel.send).toHaveBeenCalledTimes(1);
      const json = JSON.stringify(message.channel.send.mock.calls[0][0]);
      expect(json).toContain("stay plain");
      expect(json).not.toContain("not-a-color");
    });
  });
});
