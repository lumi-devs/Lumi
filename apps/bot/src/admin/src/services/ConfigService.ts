import { PrismaClient } from "@prisma/client";

export class ConfigService {
  constructor(private readonly prisma: PrismaClient) {}

  async get(guildId: string, key: string): Promise<any> {
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId },
      select: { settings: true },
    });
    return guild?.settings?.[key];
  }

  async set(guildId: string, key: string, value: any): Promise<void> {
    await this.prisma.guild.update({
      where: { id: guildId },
      data: {
        settings: {
          set: { [key]: value },
        },
      },
    });
  }

  async reset(guildId: string, key: string): Promise<void> {
    await this.prisma.guild.update({
      where: { id: guildId },
      data: {
        settings: {
          unset: [key],
        },
      },
    });
  }

  async getAll(guildId: string): Promise<Record<string, any>> {
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId },
      select: { settings: true },
    });
    return guild?.settings ?? {};
  }

  async setAll(guildId: string, settings: Record<string, any>): Promise<void> {
    await this.prisma.guild.update({
      where: { id: guildId },
      data: { settings },
    });
  }
}