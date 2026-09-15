import { envParseInteger } from "#lib/env.js";
import { container } from "@sapphire/framework";

export async function handleDataRetentionFire(): Promise<void> {
  try {
    const auditDays = envParseInteger("AUDIT_RETENTION_DAYS", 90);
    const caseDays = envParseInteger("CASE_RETENTION_DAYS", 365);
    const configHistoryDays = envParseInteger("CONFIG_HISTORY_RETENTION_DAYS", 90);
    const economyTransactionDays = envParseInteger("ECONOMY_TRANSACTION_RETENTION_DAYS", 365);

    const auditDate = new Date();
    auditDate.setDate(auditDate.getDate() - auditDays);

    const caseDate = new Date();
    caseDate.setDate(caseDate.getDate() - caseDays);

    const configHistoryDate = new Date();
    configHistoryDate.setDate(configHistoryDate.getDate() - configHistoryDays);

    const economyTransactionDate = new Date();
    economyTransactionDate.setDate(economyTransactionDate.getDate() - economyTransactionDays);

    const deletedAudit = await container.db.audit.purgeOldEntries(auditDate);
    const deletedCases = await container.db.moderation.purgeOldCases(caseDate);
    const deletedConfigHistory = await container.db.configHistory.purgeOldEntries(configHistoryDate);
    const deletedEconomyTransactions = await container.db.economy.purgeOldTransactions(economyTransactionDate);

    container.logger.info(`[DataRetention] Purged ${deletedAudit} audit ledger entries, ${deletedCases} moderation cases, ${deletedConfigHistory} module config history entries, and ${deletedEconomyTransactions} economy transactions.`);
  } catch (error) {
    container.logger.error("[DataRetention] Sweep failed:", error);
  }
}
