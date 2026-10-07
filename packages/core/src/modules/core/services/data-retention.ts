import {
  envParseInteger,
  getAuditArchiveDir,
  getClusterName,
  resolveAuditRetentionDays,
  resolveConfigHistoryRetentionDays,
  resolveModerationRetentionDays,
} from "#lib/env.js";
import { evictGuildValkeyState } from "#lib/database/guild-eviction.js";
import { DefaultClusterName, readClusterShards } from "#lib/sharding/shard-telemetry.js";
import { type Container } from "#lib/services.js";

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

    // `0` (the default) means keep moderation history forever - it has
    // legal/audit value an operator opts out of, not into. Only lifted
    // cases and resolved appeals older than the window are ever purged.
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

/**
 * Deletes guilds departed past `cutoffDate`, but only once the whole fleet is
 * reporting telemetry - during a rolling deploy some shards are briefly
 * missing, and purging then would risk racing a guild whose real departure
 * hasn't been reconciled by its (still-offline) shard yet. Returns `null`
 * when the purge was skipped for that reason.
 */
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
