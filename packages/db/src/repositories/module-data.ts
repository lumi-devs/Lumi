import type { Prisma } from "../../generated/client/index.js";
import { TTL } from "@lumi/redis";
import { Repository, type RepositoryDeps } from "./base.ts";

interface ModuleDataEnvelope {
  value: unknown;
  expiresAt: number | null;
}

export class ModuleDataRepository extends Repository {
  public constructor(deps: RepositoryDeps) {
    super(deps);
  }

  public async get(
    guildId: string,
    module: string,
    key: string,
    targetId = "",
  ): Promise<unknown | null> {
    const cacheKey = this.deps.keys.moduleData(guildId, module, targetId, key);
    const cached = await this.deps.caches.moduleData.getOrLoad<ModuleDataEnvelope>(
      cacheKey,
      TTL.moduleData * 1_000,
      async () => {
        const row = await this.reader.moduleData.findUnique({
          where: {
            guildId_moduleName_targetId_key: {
              guildId,
              moduleName: module,
              targetId,
              key,
            },
          },
          select: { value: true, expiresAt: true },
        });
        if (!row) return null;
        return { value: row.value, expiresAt: row.expiresAt?.getTime() ?? null };
      },
      { negativeTtlMs: TTL.moduleDataNegative * 1_000 },
    );

    if (!cached) return null;
    if (cached.expiresAt !== null && cached.expiresAt <= Date.now()) {
      await this.prisma.moduleData.deleteMany({
        where: { guildId, moduleName: module, targetId, key },
      });
      await this.invalidate(cacheKey);
      return null;
    }
    return cached.value;
  }

  public async set(
    guildId: string,
    module: string,
    key: string,
    value: Prisma.InputJsonValue,
    options?: { targetId?: string | undefined; ttlMs?: number | undefined },
  ): Promise<void> {
    const targetId = options?.targetId ?? "";
    const expiresAt = options?.ttlMs ? new Date(Date.now() + options.ttlMs) : null;
    await this.prisma.guild.upsert({
      where: { id: guildId },
      create: { id: guildId },
      update: {},
    });
    await this.prisma.moduleData.upsert({
      where: {
        guildId_moduleName_targetId_key: { guildId, moduleName: module, targetId, key },
      },
      update: { value, expiresAt },
      create: { guildId, moduleName: module, targetId, key, value, expiresAt },
    });
    await this.invalidate(this.deps.keys.moduleData(guildId, module, targetId, key));
  }

  public async delete(guildId: string, module: string, key: string, targetId = ""): Promise<void> {
    await this.prisma.moduleData.deleteMany({
      where: { guildId, moduleName: module, targetId, key },
    });
    await this.invalidate(this.deps.keys.moduleData(guildId, module, targetId, key));
  }
}
