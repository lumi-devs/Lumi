import { PrismaClient, type Prisma } from "@prisma/client";

type Settings = Record<string, unknown>;

const asSettings = (value: unknown): Settings =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Settings)
    : {};

export class ConfigService {
  constructor(private readonly prisma: PrismaClient) {}

  private async read(guildId: string): Promise<Settings> {
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId },
      select: { settings: true },
    });
    return asSettings(guild?.settings);
  }

  private async write(guildId: string, settings: Settings): Promise<void> {
    const value = settings as Prisma.InputJsonValue;
    await this.prisma.guild.upsert({
      where: { id: guildId },
      update: { settings: value },
      create: { id: guildId, settings: value },
    });
  }

  async get(guildId: string, key: string): Promise<any> {
    const settings = await this.read(guildId);
    return settings[key];
  }

  async set(guildId: string, key: string, value: any): Promise<void> {
    const settings = await this.read(guildId);
    settings[key] = value;
    await this.write(guildId, settings);
  }

  async reset(guildId: string, key: string): Promise<void> {
    const settings = await this.read(guildId);
    delete settings[key];
    await this.write(guildId, settings);
  }

  async getAll(guildId: string): Promise<Record<string, any>> {
    return this.read(guildId);
  }

  async setAll(guildId: string, settings: Record<string, any>): Promise<void> {
    await this.write(guildId, settings);
  }
}
