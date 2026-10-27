import type { ModuleLoader } from "@lumi/module-runtime";
import type { PrismaClient } from "@lumi/db";

export class ModuleManager {
  constructor(
    private readonly moduleLoader: ModuleLoader,
    private readonly prisma: PrismaClient,
    private readonly syncCommands: (guildId: string) => Promise<void>,
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
    await this.syncCommands(guildId);
  }

  async disable(guildId: string, moduleName: string): Promise<void> {
    await this.ensureGuild(guildId);
    await this.prisma.guildModule.upsert({
      where: { guildId_module: { guildId, module: moduleName } },
      update: { enabled: false },
      create: { guildId, module: moduleName, enabled: false },
    });
    await this.moduleLoader.setEnabled(moduleName, guildId, false);
    await this.syncCommands(guildId);
  }
}
