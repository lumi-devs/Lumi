import type { ModuleLoader } from "@lumi/module-runtime";
import type { PrismaClient } from "@lumi/db";

export class ModuleManager {
  constructor(
    private readonly moduleLoader: ModuleLoader,
    private readonly prisma: PrismaClient,
    private readonly syncCommands: (guildId: string) => Promise<void>,
  ) {}

  async enable(guildId: string, moduleName: string): Promise<void> {
    await this.setEnabled(guildId, moduleName, true);
  }

  async disable(guildId: string, moduleName: string): Promise<void> {
    await this.setEnabled(guildId, moduleName, false);
  }

  private async setEnabled(
    guildId: string,
    moduleName: string,
    enabled: boolean,
  ): Promise<void> {
    await this.prisma.guild.upsert({
      where: { id: guildId },
      update: {},
      create: { id: guildId },
    });
    await this.prisma.guildModule.upsert({
      where: { guildId_module: { guildId, module: moduleName } },
      update: { enabled },
      create: { guildId, module: moduleName, enabled },
    });
    await this.moduleLoader.setEnabled(moduleName, guildId, enabled);
    await this.syncCommands(guildId);
  }
}
