import type { NamespacedCache } from "@lumi/cache";
import type { Prisma, PrismaClient } from "@lumi/db";

export type GuildSettings = Record<string, unknown>;

const ConfigTtlMs = 60_000;
const MaxConfigAttempts = 5;

const asSettings = (value: unknown): GuildSettings =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as GuildSettings)
    : {};

function isRetryableConfigConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }
  const { code } = error as { code?: unknown };
  return code === "P2002" || code === "P2034";
}

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

    return settings ? structuredClone(settings) : {};
  }

  private async mutate(
    guildId: string,
    mutate: (settings: GuildSettings) => GuildSettings,
  ): Promise<GuildSettings> {
    for (let attempt = 1; attempt <= MaxConfigAttempts; attempt++) {
      try {
        const settings = await this.prisma.$transaction(
          async (tx) => {
            const guild = await tx.guild.findUnique({
              where: { id: guildId },
              select: { settings: true },
            });
            const next = mutate(asSettings(guild?.settings));
            const value = next as Prisma.InputJsonValue;
            await tx.guild.upsert({
              where: { id: guildId },
              update: { settings: value },
              create: { id: guildId, settings: value },
            });
            return next;
          },
          { isolationLevel: "Serializable" },
        );
        await this.cache?.delete(guildId);
        return settings;
      } catch (error) {
        if (
          attempt === MaxConfigAttempts ||
          !isRetryableConfigConflict(error)
        ) {
          throw error;
        }
      }
    }
    throw new Error("Failed to update guild configuration");
  }

  async getAll(guildId: string): Promise<GuildSettings> {
    return this.read(guildId);
  }

  async get(guildId: string, key: string): Promise<unknown> {
    const settings = await this.read(guildId);
    return settings[key];
  }

  async set(guildId: string, key: string, value: unknown): Promise<void> {
    await this.update(guildId, key, () => value);
  }

  async update(
    guildId: string,
    key: string,
    updater: (value: unknown) => unknown,
  ): Promise<unknown> {
    const settings = await this.mutate(guildId, (current) => {
      current[key] = updater(current[key]);
      return current;
    });
    return settings[key];
  }

  async reset(guildId: string, key: string): Promise<void> {
    await this.mutate(guildId, (settings) => {
      delete settings[key];
      return settings;
    });
  }

  async replaceAll(guildId: string, settings: GuildSettings): Promise<void> {
    await this.mutate(guildId, () => structuredClone(settings));
  }
}
