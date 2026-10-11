import type { Prisma } from "@prisma/client";
import { Repository } from "#src/lib/prisma/repositories/Repository.js";
import { ValkeyKeys } from "#src/lib/valkey/Client.js";

export class GuildKVRepository extends Repository {
  public async getModuleData<T = unknown>(
    guildId: string,
    module: string,
    targetId: string,
    key: string,
  ): Promise<T | null> {
    const r = await this.prisma.moduleData.findUnique({
      where: {
        guildId_moduleName_targetId_key: {
          guildId,
          moduleName: module,
          targetId,
          key,
        },
      },
    });
    if (!r) return null;
    if (r.expiresAt && r.expiresAt.getTime() <= Date.now()) {
      await this.prisma.moduleData
        .delete({
          where: {
            guildId_moduleName_targetId_key: {
              guildId,
              moduleName: module,
              targetId,
              key,
            },
          },
        })
        .catch(() => undefined);
      return null;
    }
    return r.value as T;
  }

  public async getModuleDataMany<T = unknown>(
    guildId: string,
    module: string,
    targets: { targetId: string; key: string }[],
  ): Promise<Map<string, T>> {
    const result = new Map<string, T>();
    if (targets.length === 0) return result;

    const now = new Date();
    const rows = await this.prisma.moduleData.findMany({
      where: {
        guildId,
        moduleName: module,
        OR: targets.map((t) => ({ targetId: t.targetId, key: t.key })),
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
      },
    });

    for (const row of rows) {
      result.set(`${row.targetId}:${row.key}`, row.value as T);
    }
    return result;
  }

  public async setModuleData<T = unknown>(
    guildId: string,
    module: string,
    targetId: string,
    key: string,
    value: T,
    opts?: { ttlMs?: number },
  ) {
    await this.db.ensureGuild(guildId);
    const expiresAt =
      opts?.ttlMs !== undefined
        ? new Date(Date.now() + Math.max(0, opts.ttlMs))
        : null;
    await this.prisma.moduleData.upsert({
      where: {
        guildId_moduleName_targetId_key: {
          guildId,
          moduleName: module,
          targetId,
          key,
        },
      },
      update: { value: value as Prisma.InputJsonValue, expiresAt },
      create: {
        guildId,
        moduleName: module,
        targetId,
        key,
        value: value as Prisma.InputJsonValue,
        expiresAt,
      },
    });
  }

  public purgeExpiredModuleData(): Promise<{ count: number }> {
    return this.prisma.moduleData
      .deleteMany({ where: { expiresAt: { lte: new Date() } } })
      .then(({ count }) => ({ count }));
  }

  public async listModuleData<T = unknown>(opts: {
    module: string;
    key: string;
    guildId?: string;
  }  ): Promise<{ guildId: string; targetId: string; value: T }[]> {
    const now = new Date();
    const rows = await this.prisma.moduleData.findMany({
      where: {
        moduleName: opts.module,
        key: opts.key,
        ...(opts.guildId ? { guildId: opts.guildId } : {}),
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });
    return rows.map((r) => ({
      guildId: r.guildId,
      targetId: r.targetId,
      value: r.value as T,
    }));
  }

  public async listGuildModuleData(
    guildId: string,
    filter: {
      moduleName?: string;
      targetId?: string;
      key?: string;
      skip?: number;
      take?: number;
    } = {},
  ): Promise<{
    entries: {
      moduleName: string;
      targetId: string;
      key: string;
      value: unknown;
    }[];
    total: number;
  }> {
    const where = {
      guildId,
      ...(filter.moduleName ? { moduleName: filter.moduleName } : {}),
      ...(filter.targetId ? { targetId: filter.targetId } : {}),
      ...(filter.key ? { key: filter.key } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.moduleData.findMany({
        where,
        orderBy: [{ moduleName: "asc" }, { targetId: "asc" }, { key: "asc" }],
        skip: filter.skip ?? 0,
        take: filter.take ?? 25,
      }),
      this.prisma.moduleData.count({ where }),
    ]);

    return {
      entries: rows.map((r) => ({
        moduleName: r.moduleName,
        targetId: r.targetId,
        key: r.key,
        value: r.value,
      })),
      total,
    };
  }

  public async deleteModuleData(
    guildId: string,
    module: string,
    targetId: string,
    key: string,
  ): Promise<number> {
    const { count } = await this.prisma.moduleData.deleteMany({
      where: { guildId, moduleName: module, targetId, key },
    });
    return count;
  }

  public async listModuleDataForTarget<T = unknown>(
    module: string,
    targetId: string,
  ): Promise<{ guildId: string; key: string; value: T }[]> {
    const rows = await this.prisma.moduleData.findMany({
      where: { moduleName: module, targetId },
    });
    return rows.map((r) => ({ guildId: r.guildId, key: r.key, value: r.value as T }));
  }

  public async deleteModuleDataForTarget(
    module: string,
    targetId: string,
  ): Promise<number> {
    const { count } = await this.prisma.moduleData.deleteMany({
      where: { moduleName: module, targetId },
    });
    return count;
  }

  public async incrModuleData(
    guildId: string,
    module: string,
    targetId: string,
    key: string,
    delta = 1,
  ): Promise<number> {
    const valkeyKey = ValkeyKeys.moduleData(guildId, module, targetId, key);
    const newValue = await this.valkey.hincrby(valkeyKey, "value", delta);

    await this.prisma.moduleData.upsert({
      where: {
        guildId_moduleName_targetId_key: { guildId, moduleName: module, targetId, key },
      },
      update: { value: newValue },
      create: { guildId, moduleName: module, targetId, key, value: newValue },
    });

    return newValue;
  }
}
