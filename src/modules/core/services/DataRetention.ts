import {
  envParseInteger,
  getAuditArchiveDir,
  getClusterName,
  resolveAuditRetentionDays,
  resolveConfigHistoryRetentionDays,
  resolveModerationRetentionDays,
} from "#src/lib/Env.js";
import { evictGuildValkeyState } from "#src/lib/valkey/GuildEviction.js";
import { DefaultClusterName, readClusterShards } from "#src/lib/sharding/ShardTelemetry.js";
import { type Container } from "#src/lib/Services.js";

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

export async function handleDataRetentionFire(services: Container): Promise<void> {
  try {
    const auditDays = resolveAuditRetentionDays();
    const configHistoryDays = resolveConfigHistoryRetentionDays();
    const moderationDays = resolveModerationRetentionDays();
    const economyTransactionDays = envParseInteger("ECONOMY_TRANSACTION_RETENTION_DAYS", 365);
    const guildDataDays = envParseInteger("GUILD_DATA_RETENTION_DAYS", 30);
    const archiveDir = getAuditArchiveDir();

    const auditDate = daysAgo(auditDays);
    const configHistoryDate = daysAgo(configHistoryDays);
    const economyTransactionDate = daysAgo(economyTransactionDays);
    const guildDataDate = daysAgo(guildDataDays);

    const deletedAudit = await services.db.audit.purgeOldEntries(auditDate, { archiveDir });
    const deletedConfigHistory = await services.db.configHistory.purgeOldEntries(configHistoryDate, { archiveDir });
    const deletedEconomyTransactions = await services.db.economy.purgeOldTransactions(economyTransactionDate);

    let deletedCases = 0;
    let deletedAppeals = 0;
    if (moderationDays > 0) {
      const moderationDate = daysAgo(moderationDays);
      deletedCases = await services.db.moderation.purgeOldCases(moderationDate, { archiveDir });
      deletedAppeals = await services.db.appeals.purgeOldAppeals(moderationDate, { archiveDir });
    }

    services.logger.info(`[DataRetention] Purged ${deletedAudit} audit ledger entries, ${deletedCases} moderation cases, ${deletedAppeals} appeals, ${deletedConfigHistory} module config history entries, and ${deletedEconomyTransactions} economy transactions.`);

    const deletedGuilds = await purgeDepartedGuilds(services, guildDataDate);
    if (deletedGuilds !== null) {
      services.logger.info(`[DataRetention] Purged ${deletedGuilds} departed guild(s) past their retention window.`);
    }
  } catch (error) {
    services.logger.error("[DataRetention] Sweep failed:", error);
  }
}

async function purgeDepartedGuilds(services: Container, cutoffDate: Date): Promise<number | null> {
  const clusterName = getClusterName() ?? DefaultClusterName;
  const { missingShardIds, shards, shardCount } = await readClusterShards({
    valkey: services.valkey,
    clusterName,
  });

  if (missingShardIds.length > 0 || shards.length === 0 || shards.length !== shardCount) {
    services.logger.debug(
      "[DataRetention] Fleet not fully reporting, skipping guild purge for this run.",
    );
    return null;
  }

  const purgedGuildIds = await services.db.purgeDepartedGuilds(cutoffDate);

  for (const guildId of purgedGuildIds) {
    await evictGuildValkeyState(
      services.valkey,
      services.invalidation,
      services.logger,
      guildId,
      "DataRetention",
    );
  }

  return purgedGuildIds.length;
}
