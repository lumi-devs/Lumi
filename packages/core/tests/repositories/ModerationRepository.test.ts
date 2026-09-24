import { describe, it, expect, vi, beforeEach } from "bun:test";
import { ModerationRepository } from "#lib/prisma/repositories/ModerationRepository.js";
import { repositoryCache } from "#lib/prisma/repositories/Repository.js";
import { container } from "@sapphire/framework";

vi.mock("@lumi/observability", () => ({
  cacheHits: { inc: vi.fn() },
  cacheMisses: { inc: vi.fn() },
}));

describe("ModerationRepository.isVoiceMuted", () => {
  let repo: ModerationRepository;
  let mockPrisma: any;
  let mockRedis: any;

  beforeEach(() => {
    mockPrisma = {
      moderationCase: {
        count: vi.fn().mockResolvedValue(0),
      },
    };

    mockRedis = {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn().mockResolvedValue("OK"),
    };

    (container as any).redis = mockRedis;
    repositoryCache.clear();

    const mockDb: any = { ensureGuild: vi.fn().mockResolvedValue(undefined) };
    const mockLogger: any = { warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

    repo = new ModerationRepository(mockPrisma, mockRedis, mockLogger, mockDb);
  });

  it("queries active voice_mute cases with the same predicate as getActiveCases", async () => {
    mockPrisma.moderationCase.count.mockResolvedValue(1);
    const result = await repo.isVoiceMuted("g-1", "u-1");
    expect(result).toBe(true);
    expect(mockPrisma.moderationCase.count).toHaveBeenCalledWith({
      where: { guildId: "g-1", userId: "u-1", action: "voice_mute", active: true },
    });
  });

  it("caches a negative (not-muted) result so a second call skips Postgres", async () => {
    mockPrisma.moderationCase.count.mockResolvedValue(0);

    const first = await repo.isVoiceMuted("g-2", "u-2");
    const second = await repo.isVoiceMuted("g-2", "u-2");

    expect(first).toBe(false);
    expect(second).toBe(false);
    expect(mockPrisma.moderationCase.count).toHaveBeenCalledTimes(1);
  });
});
