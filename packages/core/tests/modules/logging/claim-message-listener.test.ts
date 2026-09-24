import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@sapphire/framework";
import LoggingClaimMessageListener from "#modules/logging/listeners/claimMessage.js";
import {
  consumeLogClaimCode,
  normalizeLogClaimCode,
  peekLogClaimCode,
  registerLogClaim,
} from "#modules/logging/services/claims.js";

vi.mock("#modules/logging/services/claims.js", () => ({
  consumeLogClaimCode: vi.fn(),
  normalizeLogClaimCode: vi.fn((raw: string) => (raw === "AB23CD" ? "AB23CD" : null)),
  peekLogClaimCode: vi.fn().mockResolvedValue("issuer-1"),
  registerLogClaim: vi.fn().mockResolvedValue(undefined),
}));

const __actualCommands = await import("#lib/commands.js");
vi.mock("#lib/commands.js", () => {
  const actual: any = __actualCommands;
  return {
    ...actual,
    fetchTyped: vi.fn().mockResolvedValue((key: string, _opts?: any) => key),
  };
});

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    content: "AB23CD",
    guildId: "guild-1",
    guild: { id: "guild-1", ownerId: "owner-1" },
    channelId: "channel-1",
    channel: { isThread: () => false },
    author: { id: "author-1" },
    member: { roles: [] },
    id: "msg-1",
    reply: vi.fn().mockResolvedValue({ id: "reply-1" }),
    ...overrides,
  };
}

describe("logging claimMessage listener", () => {
  let listener: LoggingClaimMessageListener;

  beforeEach(() => {
    vi.clearAllMocks();
    (normalizeLogClaimCode as any).mockImplementation((raw: string) =>
      raw === "AB23CD" ? "AB23CD" : null,
    );
    (peekLogClaimCode as any).mockResolvedValue("issuer-1");
    (consumeLogClaimCode as any).mockResolvedValue("issuer-1");

    (container as any).permitResolver = {
      hasPermit: vi.fn().mockResolvedValue(true),
    };
    (container as any).db = {
      audit: { queueAuditLog: vi.fn().mockResolvedValue(undefined) },
    };

    listener = new LoggingClaimMessageListener(
      {
        name: "loggingClaimMessage",
        path: "/path/to/modules/logging/listeners/claimMessage.ts",
        root: "/path/to/modules",
        store: { name: "listeners" } as any,
      },
      { module: "logging" },
    );
  });

  it("checks the logging.claim permit node instead of a raw ManageGuild check", async () => {
    const message = makeMessage();
    await (listener as any).handle(message);

    expect(container.permitResolver.hasPermit).toHaveBeenCalledWith({
      guildId: "guild-1",
      userId: "author-1",
      roleIds: [],
      channelId: "channel-1",
      permitNode: "logging.claim",
      guildOwnerId: "owner-1",
    });
    expect(consumeLogClaimCode).toHaveBeenCalledWith("guild-1", "AB23CD");
    expect(message.reply).toHaveBeenCalledTimes(1);
    expect(registerLogClaim).toHaveBeenCalled();
  });

  it("does not consume the code or reply when the permit is denied", async () => {
    (container.permitResolver.hasPermit as any).mockResolvedValue(false);
    const message = makeMessage();
    await (listener as any).handle(message);

    expect(consumeLogClaimCode).not.toHaveBeenCalled();
    expect(message.reply).not.toHaveBeenCalled();
    expect(registerLogClaim).not.toHaveBeenCalled();
  });

  it("renders the confirmation card through the logging:claimAddedTitle/claimAddedMessage i18n keys", async () => {
    const message = makeMessage();
    await (listener as any).handle(message);

    const payload = message.reply.mock.calls[0]![0];
    const json = JSON.stringify(payload);
    expect(json).toContain("logging:claimAddedTitle");
    expect(json).toContain("logging:claimAddedMessage");
  });
});
