import { describe, it, expect, vi, beforeEach } from "vitest";
import { container } from "@sapphire/framework";

vi.mock("#lib/outbound/send-queue.js", () => ({
  queueSend: vi.fn().mockResolvedValue(undefined),
}));

import { queueSend } from "#lib/outbound/send-queue.js";
import {
  resolveLogChannel,
  sendLog,
} from "#modules/logging/lib/send.js";

const GUILD_ID = "123456789012345678";
const MESSAGE_CHANNEL = "111111111111111111";
const MEMBER_CHANNEL = "222222222222222222";
const DEFAULT_CHANNEL = "333333333333333333";

describe("logging per-type channel resolution", () => {
  let configs: Record<string, unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    configs = {};

    (container as any).db = {
      config: {
        getModuleConfig: vi
          .fn()
          .mockImplementation(
            async (_guildId: string, _module: string, key: string) =>
              configs[key] ?? null,
          ),
      },
    };
  });

  it("prefers the message channel for message toggles", async () => {
    configs = {
      message_log_channel_id: MESSAGE_CHANNEL,
      log_channel_id: DEFAULT_CHANNEL,
    };

    await expect(
      resolveLogChannel(GUILD_ID, "message_deletes"),
    ).resolves.toBe(MESSAGE_CHANNEL);
    await expect(
      resolveLogChannel(GUILD_ID, "message_edits"),
    ).resolves.toBe(MESSAGE_CHANNEL);
  });

  it("prefers the member channel for member toggles", async () => {
    configs = {
      member_log_channel_id: MEMBER_CHANNEL,
      log_channel_id: DEFAULT_CHANNEL,
    };

    for (const toggle of [
      "member_joins",
      "member_leaves",
      "member_bans",
      "member_unbans",
      "nickname_changes",
      "role_changes",
    ]) {
      await expect(resolveLogChannel(GUILD_ID, toggle)).resolves.toBe(
        MEMBER_CHANNEL,
      );
    }
  });

  it("falls back to the default log channel when no per-type channel is set", async () => {
    configs = { log_channel_id: DEFAULT_CHANNEL };

    await expect(resolveLogChannel(GUILD_ID, "message_deletes")).resolves.toBe(
      DEFAULT_CHANNEL,
    );
    await expect(resolveLogChannel(GUILD_ID, "member_joins")).resolves.toBe(
      DEFAULT_CHANNEL,
    );
  });

  it("resolves null when neither per-type nor default channel is set", async () => {
    configs = {};

    await expect(
      resolveLogChannel(GUILD_ID, "message_deletes"),
    ).resolves.toBeNull();
  });

  it("dispatches to the resolved channel", async () => {
    configs = {
      member_log_channel_id: MEMBER_CHANNEL,
      log_channel_id: DEFAULT_CHANNEL,
    };

    await sendLog(GUILD_ID, "member_joins", 0x00ff00, "Member Joined", ["line"]);

    expect(queueSend).toHaveBeenCalledOnce();
    expect(queueSend).toHaveBeenCalledWith({
      channelId: MEMBER_CHANNEL,
      logCard: { color: 0x00ff00, title: "Member Joined", lines: ["line"] },
    });
  });

  it("sends nothing when resolution is disabled", async () => {
    configs = {};

    await sendLog(GUILD_ID, "member_joins", 0x00ff00, "Member Joined", ["line"]);

    expect(queueSend).not.toHaveBeenCalled();
  });
});
