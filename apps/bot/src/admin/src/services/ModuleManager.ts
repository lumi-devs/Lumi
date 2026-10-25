import { ModuleLoader } from "@lumi/module-runtime";
import { PrismaClient } from "@prisma/client";
import { ConfigService } from "./ConfigService.js";

export class ModuleManager {
  constructor(
    private readonly moduleLoader: ModuleLoader,
    private readonly prisma: PrismaClient,
    private readonly configService: ConfigService,
  ) {}

  private async ensureGuild(guildId: string): Promise<void> {
    await this.prisma.guild.upsert({
      where: { id: guildId },
      update: {},
      create: { id: guildId },
    });
  }

  async enable(guildId: string, moduleName: string): Promise<void> {
    await this.ensureGuild(guildId);
    await this.prisma.guildModule.upsert({
      where: { guildId_module: { guildId, module: moduleName } },
      update: { enabled: true },
      create: { guildId, module: moduleName, enabled: true },
    });
    await this.moduleLoader.setEnabled(moduleName, guildId, true);
  }

  async disable(guildId: string, moduleName: string): Promise<void> {
    await this.ensureGuild(guildId);
    await this.prisma.guildModule.upsert({
      where: { guildId_module: { guildId, module: moduleName } },
      update: { enabled: false },
      create: { guildId, module: moduleName, enabled: false },
    });
    await this.moduleLoader.setEnabled(moduleName, guildId, false);
  }

  async reload(moduleName: string): Promise<void> {
    await this.moduleLoader.reload(moduleName);
  }

  async list(guildId: string): Promise<Array<{ name: string; displayName: string; emoji: string; description: string; enabled: boolean }>> {
    const globalModules = await this.moduleLoader.listGlobal();
    const guildModules = await this.prisma.guildModule.findMany({ where: { guildId } });
    const stored = new Map<string, boolean>(
      (guildModules ?? []).map((m: any) => [m.module, Boolean(m.enabled)]),
    );

    return globalModules.map((m) => ({
      name: m.name,
      displayName: m.displayName || m.name,
      emoji: m.emoji || "⚙️",
      description: m.description,
      enabled: stored.get(m.name) ?? this.moduleLoader.isEnabled(guildId, m.name),
    }));
  }

  async listGlobal(): Promise<Array<{ name: string; description: string }>> {
    return this.moduleLoader.listGlobal();
  }

  async getConfig(guildId: string, moduleName: string): Promise<Record<string, any>> {
    const value = await this.configService.get(guildId, moduleName);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, any>)
      : {};
  }

  async setConfig(guildId: string, moduleName: string, config: Record<string, any>): Promise<void> {
    await this.configService.set(guildId, moduleName, config);
  }
}
