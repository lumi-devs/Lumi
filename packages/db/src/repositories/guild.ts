import type { Guild } from "../../generated/client/index.js";
import { TTL } from "@lumi/redis";
import { Repository, type RepositoryDeps } from "./base.ts";

export class GuildRepository extends Repository {
  public constructor(deps: RepositoryDeps) {
    super(deps);
  }

  public get(guildId: string): Promise<Guild | null> {
    return this.deps.caches.guild.getOrLoad(
      this.deps.keys.guild(guildId),
      TTL.guild * 1_000,
      () => this.reader.guild.findUnique({ where: { id: guildId } }),
    );
  }

  public async ensure(guildId: string): Promise<void> {
    await this.prisma.guild.upsert({
      where: { id: guildId },
      create: { id: guildId },
      update: {},
    });
    await this.invalidate(this.deps.keys.guild(guildId));
  }

  public async setPrefix(guildId: string, prefix: string | null): Promise<void> {
    await this.ensure(guildId);
    await this.prisma.guild.update({ where: { id: guildId }, data: { prefix } });
    await this.invalidate(this.deps.keys.guild(guildId));
  }

  public async markLeft(guildId: string): Promise<void> {
    await this.prisma.guild.updateMany({
      where: { id: guildId },
      data: { leftAt: new Date() },
    });
    await this.invalidate(this.deps.keys.guild(guildId));
  }

  public async markRejoined(guildId: string): Promise<void> {
    await this.prisma.guild.upsert({
      where: { id: guildId },
      create: { id: guildId },
      update: { leftAt: null },
    });
    await this.invalidate(this.deps.keys.guild(guildId));
  }

  public async activeIds(): Promise<string[]> {
    const rows = await this.reader.guild.findMany({
      where: { leftAt: null },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  public async purgeDeparted(cutoff: Date): Promise<string[]> {
    const rows = await this.prisma.guild.findMany({
      where: { leftAt: { lt: cutoff } },
      select: { id: true },
    });
    if (rows.length === 0) return [];
    await this.prisma.guild.deleteMany({ where: { leftAt: { lt: cutoff } } });
    await this.invalidate(...rows.map((row) => this.deps.keys.guild(row.id)));
    return rows.map((row) => row.id);
  }
}
