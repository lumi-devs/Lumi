import type { NamespacedCache } from "@lumi/cache";
import type { PrismaClient, Prisma } from "@lumi/db";

export type GuildSettings = Record<string, unknown>;

const ConfigTtlMs = 60_000;

const asSettings = (value: unknown): GuildSettings =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as GuildSettings)
    : {};

export class ConfigService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cache?: NamespacedCache<GuildSettings>,
  ) {}

  private async load(guildId: string): Promise<GuildSettings> {
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId },
      select: { settings: true },
    });
    return asSettings(guild?.settings);
  }

  private async read(guildId: string): Promise<GuildSettings> {
    if (!this.cache) return this.load(guildId);
    const settings = await this.cache.getOrLoad(guildId, ConfigTtlMs, () =>
      this.load(guildId),
    );
    // The cache hands back the shared object. Copy before callers mutate it so
    // a failed write cannot leave a half-edited value in the L1/L2 cache.
    return settings ? structuredClone(settings) : {};
  }

  private async write(guildId: string, settings: GuildSettings): Promise<void> {
    const value = settings as Prisma.InputJsonValue;
    await this.prisma.guild.upsert({
      where: { id: guildId },
      update: { settings: value },
      create: { id: guildId, settings: value },
    });
    await this.cache?.delete(guildId);
  }

  async get(guildId: string, key: string): Promise<unknown> {
    const settings = await this.read(guildId);
    return settings[key];
  }

  async set(guildId: string, key: string, value: unknown): Promise<void> {
    const settings = await this.read(guildId);
    settings[key] = value;
    await this.write(guildId, settings);
  }

  async reset(guildId: string, key: string): Promise<void> {
    const settings = await this.read(guildId);
    delete settings[key];
    await this.write(guildId, settings);
  }

  async getAll(guildId: string): Promise<GuildSettings> {
    return this.read(guildId);
  }

  async setAll(guildId: string, settings: GuildSettings): Promise<void> {
    await this.write(guildId, settings);
  }
}
