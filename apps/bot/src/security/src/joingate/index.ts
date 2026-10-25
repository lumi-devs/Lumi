import { PrismaClient } from "@prisma/client";

export interface JoinGateConfig {
  enabled: boolean;
  heuristics: Record<string, any>;
}

export class JoinGateService {
  constructor(private readonly prisma: PrismaClient) {}

  async getConfig(guildId: string): Promise<JoinGateConfig> {
    const config = await this.prisma.securityConfig.findUnique({
      where: { guildId },
    });
    return {
      enabled: config?.joinGateEnabled ?? false,
      heuristics: (config?.joinGateHeuristics as any) ?? {},
    };
  }

  async setConfig(guildId: string, config: Partial<JoinGateConfig>): Promise<void> {
    await this.prisma.securityConfig.upsert({
      where: { guildId },
      update: {
        joinGateEnabled: config.enabled,
        joinGateHeuristics: config.heuristics,
      },
      create: {
        guildId,
        joinGateEnabled: config.enabled ?? false,
        joinGateHeuristics: config.heuristics ?? {},
      },
    });
  }

  async evaluateJoin(guildId: string, userId: string): Promise<{ action: "allow" | "timeout" | "quarantine" | "kick" }> {
    // Evaluate join heuristics
    return { action: "allow" };
  }
}

export class JoinGatePanel {
  static async render(services: any, guildId: string) {
    // Join gate panel UI
  }
}