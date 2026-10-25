import { createConnectRouter } from "@connectrpc/connect";
import { PermitService } from "../gen/proto/lumi/v2/permits_connect.js";
import { LevelingService } from "../gen/proto/lumi/v2/leveling_connect.js";
import { EconomyService } from "../gen/proto/lumi/v2/economy_connect.js";
import { FleetService } from "../gen/proto/lumi/v2/fleet_connect.js";
import { ModuleService } from "../gen/proto/lumi/v2/module_connect.js";

export function createRpcRouter(services: any) {
  const router = createConnectRouter();
  
  // Permit routes
  router.service(PermitService, {
    listPermits: async (req: any): Promise<any> => {
      const permits = await services.permits.listPermits(req.guildId);
      return { permits: permits.map((p: any) => ({
        id: p.id,
        name: p.name,
        node: p.node,
        polarity: p.polarity,
        position: p.position,
        builtin: p.builtin,
        expiresAt: p.expiresAt?.toISOString() ?? null,
        schedule: p.schedule ?? null,
        timezone: p.timezone ?? null,
        conditions: p.conditions ?? null,
      })) };
    },
    createPermit: async (req: any): Promise<any> => {
      const permit = await services.permits.createPermit({
        guildId: req.guildId,
        name: req.name,
        node: req.node,
        polarity: req.polarity,
        position: req.position,
        builtin: false,
        expiresAt: req.expiresAt ? new Date(req.expiresAt) : null,
        schedule: req.schedule ?? null,
        timezone: req.timezone ?? null,
        conditions: req.conditions ?? null,
      });
      return { permit: { id: permit.id } };
    },
    updatePermit: async (req: any): Promise<any> => {
      const permit = await services.permits.updatePermit(req.permitId, {
        name: req.name,
        node: req.node,
        polarity: req.polarity,
        position: req.position,
        expiresAt: req.expiresAt ? new Date(req.expiresAt) : null,
        schedule: req.schedule ?? null,
        timezone: req.timezone ?? null,
        conditions: req.conditions ?? null,
      });
      return { permit: permit ? { id: permit.id } : null };
    },
    deletePermit: async (req: any): Promise<any> => {
      const success = await services.permits.deletePermit(req.permitId);
      return { success };
    },
    movePermit: async (req: any): Promise<any> => {
      const success = await services.permits.movePermit(req.guildId, req.permitId, req.direction);
      return { success };
    },
    assignPermit: async (req: any): Promise<any> => {
      const success = await services.permits.assignPermit(
        req.permitId,
        req.targetType,
        req.targetId,
        req.grantedBy,
        req.expiresAt ? new Date(req.expiresAt) : null
      );
      return { success };
    },
    unassignPermit: async (req: any): Promise<any> => {
      const success = await services.permits.unassignPermit(req.permitId, req.targetType, req.targetId);
      return { success };
    },
    explainPermit: async (req: any): Promise<any> => {
      const rows = await services.permits.explainPermit(req.node, {
        guildId: req.guildId,
        userId: req.userId,
        roleIds: req.roleIds,
        channelId: req.channelId,
        guildOwnerId: req.guildOwnerId,
      });
      return { rows };
    },
    getExpiringPermits: async (req: any): Promise<any> => {
      const permits = await services.permits.getExpiringPermits(req.guildId, new Date(req.before));
      return { permits };
    },
  });
  
  // Leveling routes
  router.service(LevelingService, {
    getLeaderboard: async (req: any): Promise<any> => {
      const { users, total, totalPages } = await services.leveling.getLeaderboard(
        req.guildId,
        req.page,
        req.perPage
      );
      return { users, total, totalPages };
    },
    getUserRank: async (req: any): Promise<any> => {
      const rank = await services.leveling.getUserRank(req.guildId, req.userId);
      return rank;
    },
    generateRankCard: async (req: any): Promise<any> => {
      const buffer = await services.leveling.generateRankCard(req.guildId, req.userId);
      return { image: buffer };
    },
    setXpCurve: async (req: any): Promise<any> => {
      await services.leveling.setXpCurve(req.guildId, req.curve);
      return { success: true };
    },
  });
  
  // Economy routes
  router.service(EconomyService, {
    getBalance: async (req: any): Promise<any> => {
      const balance = await services.economy.getBalance(req.guildId, req.userId);
      return { balance: balance.toString(), bankBalance: "0", totalEarned: "0", totalSpent: "0" };
    },
    transfer: async (req: any): Promise<any> => {
      const result = await services.economy.transfer(
        req.guildId,
        req.fromUserId,
        req.toUserId,
        BigInt(req.amount)
      );
      return { success: result.success, tax: result.tax?.toString(), error: result.error };
    },
    getShop: async (req: any): Promise<any> => {
      const shop = await services.economy.getShop(req.guildId);
      return { items: shop };
    },
    buyItem: async (req: any): Promise<any> => {
      const result = await services.economy.buyItem(req.guildId, req.userId, req.itemId);
      return { success: result.success, error: result.error };
    },
    generateBalanceCard: async (req: any): Promise<any> => {
      const buffer = await services.economy.generateBalanceCard(req.guildId, req.userId);
      return { image: buffer };
    },
    getLeaderboard: async (req: any): Promise<any> => {
      const { users, total, totalPages } = await services.economy.getLeaderboard(req.guildId, req.page, req.perPage);
      return { users, total, totalPages };
    },
  });
  
  // Fleet routes
  router.service(FleetService, {
    getFleetStatus: async (): Promise<any> => {
      return await services.fleet.getStatus();
    },
    getShardAssignment: async (req: any): Promise<any> => {
      return await services.fleet.getShardAssignment(req.guildId);
    },
    rebalanceShards: async (): Promise<any> => {
      return await services.fleet.rebalanceShards();
    },
    getNodeHealth: async (req: any): Promise<any> => {
      return await services.fleet.getNodeHealth(req.nodeId);
    },
    triggerRollingRestart: async (req: any): Promise<any> => {
      return await services.fleet.triggerRollingRestart(req.batchSize, req.delaySeconds);
    },
  });
  
  // Module routes
  router.service(ModuleService, {
    listModules: async (): Promise<any> => {
      return { modules: await services.moduleManager.listGlobal() };
    },
    getModuleConfig: async (req: any): Promise<any> => {
      return { config: await services.moduleManager.getConfig(req.guildId, req.moduleName) };
    },
    setModuleConfig: async (req: any): Promise<any> => {
      await services.moduleManager.setConfig(req.guildId, req.moduleName, req.config);
      return { success: true };
    },
    enableModule: async (req: any): Promise<any> => {
      await services.moduleManager.enable(req.guildId, req.moduleName);
      return { success: true };
    },
    disableModule: async (req: any): Promise<any> => {
      await services.moduleManager.disable(req.guildId, req.moduleName);
      return { success: true };
    },
    reloadModule: async (req: any): Promise<any> => {
      await services.moduleManager.reload(req.moduleName);
      return { success: true };
    },
  });
  
  return router;
}