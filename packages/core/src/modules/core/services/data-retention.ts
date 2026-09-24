import { envParseInteger, getClusterName } from "#lib/env.js";
import { evictGuildRedisState } from "#lib/database/guild-eviction.js";
import { DefaultClusterName, readClusterShards } from "#lib/sharding/shard-telemetry.js";
import { container } from "@sapphire/framework";

export async function handleDataRetentionFire(): Promise<void> {
  try {
    const auditDays = envParseInteger("AUDIT_RETENTION_DAYS", 90);
    const caseDays = envParseInteger("CASE_RETENTION_DAYS", 365);
    const configHistoryDays = envParseInteger("CONFIG_HISTORY_RETENTION_DAYS", 90);
    const economyTransactionDays = envParseInteger("ECONOMY_TRANSACTION_RETENTION_DAYS", 365);
    const guildDataDays = envParseInteger("GUILD_DATA_RETENTION_DAYS", 30);

    const auditDate = new Date();
    auditDate.setDate(auditDate.getDate() - auditDays);

    const caseDate = new Date();
    caseDate.setDate(caseDate.getDate() - caseDays);

    const configHistoryDate = new Date();
    configHistoryDate.setDate(configHistoryDate.getDate() - configHistoryDays);

    const economyTransactionDate = new Date();
    economyTransactionDate.setDate(economyTransactionDate.getDate() - economyTransactionDays);

    const guildDataDate = new Date();
    guildDataDate.setDate(guildDataDate.getDate() - guildDataDays);

    const deletedAudit = await container.db.audit.purgeOldEntries(auditDate);
    const deletedCases = await container.db.moderation.purgeOldCases(caseDate);
    const deletedConfigHistory = await container.db.configHistory.purgeOldEntries(configHistoryDate);
    const deletedEconomyTransactions = await container.db.economy.purgeOldTransactions(economyTransactionDate);

    container.logger.info(`[DataRetention] Purged ${deletedAudit} audit ledger entries, ${deletedCases} moderation cases, ${deletedConfigHistory} module config history entries, and ${deletedEconomyTransactions} economy transactions.`);

    const deletedGuilds = await purgeDepartedGuilds(guildDataDate);
    if (deletedGuilds !== null) {
      container.logger.info(`[DataRetention] Purged ${deletedGuilds} departed guild(s) past their retention window.`);
    }
  } catch (error) {
    container.logger.error("[DataRetention] Sweep failed:", error);
  }
}

/**
 * Deletes guilds departed past `cutoffDate`, but only once the whole fleet is
 * reporting telemetry - during a rolling deploy some shards are briefly
 * missing, and purging then would risk racing a guild whose real departure
 * hasn't been reconciled by its (still-offline) shard yet. Returns `null`
 * when the purge was skipped for that reason.
 */
async function purgeDepartedGuilds(cutoffDate: Date): Promise<number | null> {
  const clusterName = getClusterName() ?? DefaultClusterName;
  const { missingShardIds, shards, shardCount } = await readClusterShards({
    redis: container.redis,
    clusterName,
  });

  if (missingShardIds.length > 0 || shards.length === 0 || shards.length !== shardCount) {
    container.logger.debug(
      "[DataRetention] Fleet not fully reporting, skipping guild purge for this run.",
    );
    return null;
  }

  const purgedGuildIds = await container.db.purgeDepartedGuilds(cutoffDate);

  for (const guildId of purgedGuildIds) {
    await evictGuildRedisState(
      container.redis,
      container.invalidation,
      container.logger,
      guildId,
      "DataRetention",
    );
  }

  return purgedGuildIds.length;
}
