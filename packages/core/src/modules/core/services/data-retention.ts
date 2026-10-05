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
import { container } from "@sapphire/framework";

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

export async function handleDataRetentionFire(): Promise<void> {
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

    const deletedAudit = await container.db.audit.purgeOldEntries(auditDate, { archiveDir });
    const deletedConfigHistory = await container.db.configHistory.purgeOldEntries(configHistoryDate, { archiveDir });
    const deletedEconomyTransactions = await container.db.economy.purgeOldTransactions(economyTransactionDate);

    // `0` (the default) means keep moderation history forever - it has
    // legal/audit value an operator opts out of, not into. Only lifted
    // cases and resolved appeals older than the window are ever purged.
    let deletedCases = 0;
    let deletedAppeals = 0;
    if (moderationDays > 0) {
      const moderationDate = daysAgo(moderationDays);
      deletedCases = await container.db.moderation.purgeOldCases(moderationDate, { archiveDir });
      deletedAppeals = await container.db.appeals.purgeOldAppeals(moderationDate, { archiveDir });
    }

    container.logger.info(`[DataRetention] Purged ${deletedAudit} audit ledger entries, ${deletedCases} moderation cases, ${deletedAppeals} appeals, ${deletedConfigHistory} module config history entries, and ${deletedEconomyTransactions} economy transactions.`);

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
    valkey: container.valkey,
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
    await evictGuildValkeyState(
      container.valkey,
      container.invalidation,
      container.logger,
      guildId,
      "DataRetention",
    );
  }

  return purgedGuildIds.length;
}
