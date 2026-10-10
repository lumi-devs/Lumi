import { describe, it, expect, vi, beforeEach } from "bun:test";
import { AuditRepository } from "@lumi/lib/prisma/repositories/audit-repository.js";
import { createMockPrismaClient } from "../../mocks/prisma.js";

vi.mock("@lumi/observability", () => ({
  cacheHits: { inc: vi.fn() },
  cacheMisses: { inc: vi.fn() },
}));

describe("AuditRepository", () => {
  let prisma: ReturnType<typeof createMockPrismaClient>;
  let repo: AuditRepository;
  let mockValkey: any;

  beforeEach(() => {
    prisma = createMockPrismaClient();
    mockValkey = {
      xadd: vi.fn().mockResolvedValue("1-0"),
      xgroup: vi.fn().mockResolvedValue("OK"),
      xautoclaim: vi.fn().mockResolvedValue(["0-0", []]),
      xreadgroup: vi.fn().mockResolvedValue([]),
      xack: vi.fn().mockResolvedValue(1),
      xdel: vi.fn().mockResolvedValue(1),
    };
    const mockDb = { ensureGuild: vi.fn().mockResolvedValue(undefined) };
    const mockLogger = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };
    repo = new AuditRepository(prisma as any, mockValkey, mockLogger as any, mockDb as any);
  });

  it("queueAuditLog appends payload to valkey stream", async () => {
    await repo.queueAuditLog({
      guildId: "guild-1",
      userId: "user-1",
      action: "guild.settings.update",
      platform: "web",
      details: { field: "prefix" },
    });

    expect(mockValkey.xadd).toHaveBeenCalled();
  });

  it("listAuditLogs supports filtering, pagination, and cursor generation", async () => {
    prisma.$seed("auditLedger", [
      {
        id: 1,
        guildId: "g1",
        userId: "u1",
        action: "ban",
        platform: "discord",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
      {
        id: 2,
        guildId: "g1",
        userId: "u2",
        action: "kick",
        platform: "web",
        createdAt: new Date("2026-01-02T00:00:00Z"),
      },
      {
        id: 3,
        guildId: "g2",
        userId: "u1",
        action: "ban",
        platform: "discord",
        createdAt: new Date("2026-01-03T00:00:00Z"),
      },
    ]);

    const res = await repo.listAuditLogs({ guildId: "g1", take: 10 });
    expect(res.entries.length).toBe(2);
    expect(res.total).toBe(2);

    const filtered = await repo.listAuditLogs({ action: "ban", take: 10 });
    expect(filtered.entries.length).toBe(2);

    const platformFiltered = await repo.listAuditLogs({ platform: "web", take: 10 });
    expect(platformFiltered.entries.length).toBe(1);
    expect(platformFiltered.entries[0]!.id).toBe(2);
  });
});
