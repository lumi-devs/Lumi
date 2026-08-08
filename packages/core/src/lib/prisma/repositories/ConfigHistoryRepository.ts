import type { Prisma } from "@prisma/client";
import { Repository } from "#lib/prisma/repositories/Repository.js";

export interface ConfigHistoryEntry {
  id: string;
  guildId: string;
  moduleName: string;
  key: string;
  oldValue: unknown;
  newValue: unknown;
  actorId: string;
  createdAt: Date;
}

/** Audit trail of config changes (`ModuleConfigHistory`). */
export class ConfigHistoryRepository extends Repository {
  public async logConfigChange(data: {
    guildId: string;
    moduleName: string;
    key: string;
    oldValue: unknown;
    newValue: unknown;
    actorId: string;
  }): Promise<void> {
    await this.prisma.moduleConfigHistory.create({
      data: {
        guildId: data.guildId,
        moduleName: data.moduleName,
        key: data.key,
        oldValue: data.oldValue ?? undefined,
        newValue: data.newValue as Prisma.InputJsonValue,
        actorId: data.actorId,
      },
    });
  }

  public getConfigHistory(
    guildId: string,
    moduleName: string,
    key?: string,
    take = 10,
  ): Promise<ConfigHistoryEntry[]> {
    return this.prisma.moduleConfigHistory.findMany({
      where: { guildId, moduleName, ...(key ? { key } : {}) },
      orderBy: { createdAt: "desc" },
      take,
    });
  }

  public async listGuildConfigHistory(
    guildId: string,
    filter: {
      moduleName?: string;
      key?: string;
      actorId?: string;
      skip?: number;
      take?: number;
    } = {},
  ): Promise<{ entries: ConfigHistoryEntry[]; total: number }> {
    const where = {
      guildId,
      ...(filter.moduleName ? { moduleName: filter.moduleName } : {}),
      ...(filter.key ? { key: filter.key } : {}),
      ...(filter.actorId ? { actorId: filter.actorId } : {}),
    };

    const [entries, total] = await this.prisma.$transaction([
      this.prisma.moduleConfigHistory.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: filter.skip ?? 0,
        take: filter.take ?? 25,
      }),
      this.prisma.moduleConfigHistory.count({ where }),
    ]);

    return { entries, total };
  }

  public getConfigHistoryEntry(id: string): Promise<ConfigHistoryEntry | null> {
    return this.prisma.moduleConfigHistory.findUnique({
      where: { id },
    });
  }
}
