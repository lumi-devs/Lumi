import { describe, it, expect, vi, beforeEach } from "bun:test";
import loggingClaimMessageListener from "@lumi/modules/logging/listeners/claimMessage.js";

vi.mock("@lumi/application/services/logging/claims.js", () => ({
  normalizeLogClaimCode: vi.fn(),
  peekLogClaimCode: vi.fn(),
  consumeLogClaimCode: vi.fn(),
  registerLogClaim: vi.fn(),
}));

vi.mock("@lumi/lib/i18n/index.js", () => ({
  fetchTyped: vi.fn().mockResolvedValue((key: string) => key),
}));

import {
  normalizeLogClaimCode,
  peekLogClaimCode,
  consumeLogClaimCode,
  registerLogClaim,
} from "@lumi/application/services/logging/claims.js";

function makeServices(hasPermit = true) {
  return {
    permitResolver: { hasPermit: vi.fn().mockResolvedValue(hasPermit) },
    db: { audit: { queueAuditLog: vi.fn().mockResolvedValue(undefined) } },
    logger: { warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() },
  } as any;
}

function makeMessage(content: string) {
  return {
    id: "msg-1",
    content,
    guildId: "g1",
    channelId: "c1",
    author: { id: "u1" },
    member: { roles: { cache: new Map() } },
    guild: { ownerId: "o1" },
    channel: { isThread: () => false },
    reply: vi.fn().mockResolvedValue({ id: "reply-1" }),
  } as any;
}

describe("loggingClaimMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ignores messages without a claim code", async () => {
    (normalizeLogClaimCode as any).mockReturnValue(null);

    await loggingClaimMessageListener.execute(makeServices(), makeMessage("hello world"));

    expect(peekLogClaimCode).not.toHaveBeenCalled();
    expect(registerLogClaim).not.toHaveBeenCalled();
  });

  it("ignores codes with no pending claim", async () => {
    (normalizeLogClaimCode as any).mockReturnValue("ABC123");
    (peekLogClaimCode as any).mockResolvedValue(null);

    await loggingClaimMessageListener.execute(makeServices(), makeMessage("claim ABC123"));

    expect(consumeLogClaimCode).not.toHaveBeenCalled();
    expect(registerLogClaim).not.toHaveBeenCalled();
  });

  it("ignores claimants without the logging.claim permit", async () => {
    (normalizeLogClaimCode as any).mockReturnValue("ABC123");
    (peekLogClaimCode as any).mockResolvedValue("chan-9");

    await loggingClaimMessageListener.execute(makeServices(false), makeMessage("claim ABC123"));

    expect(consumeLogClaimCode).not.toHaveBeenCalled();
    expect(registerLogClaim).not.toHaveBeenCalled();
  });

  it("registers the claim and audits it for a permitted claimant", async () => {
    (normalizeLogClaimCode as any).mockReturnValue("ABC123");
    (peekLogClaimCode as any).mockResolvedValue("chan-9");
    (consumeLogClaimCode as any).mockResolvedValue("chan-9");
    const services = makeServices();
    const message = makeMessage("claim ABC123");

    await loggingClaimMessageListener.execute(services, message);

    expect(registerLogClaim).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ channelId: "c1", authorId: "u1", messageId: "msg-1" }),
    );
    expect(message.reply).toHaveBeenCalled();
    expect(services.db.audit.queueAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ guildId: "g1", action: "logging.claim.registered" }),
    );
  });
});
