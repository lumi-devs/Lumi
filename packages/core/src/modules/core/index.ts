import { Module, DefineModule } from "#lib/module-system/Module.js";
import { Emojis } from "#lib/utilities/assets.js";
import type { Piece } from "@sapphire/framework";

import { registerTaskFireHandler } from "#lib/task-fire-registry.js";
import { envParseInteger } from "#lib/env.js";
import { container } from "@sapphire/framework";

async function handleDataRetentionFire(): Promise<void> {
  try {
    const auditDays = envParseInteger("AUDIT_RETENTION_DAYS", 90);
    const caseDays = envParseInteger("CASE_RETENTION_DAYS", 365);
    
    const auditDate = new Date();
    auditDate.setDate(auditDate.getDate() - auditDays);
    
    const caseDate = new Date();
    caseDate.setDate(caseDate.getDate() - caseDays);
    
    const deletedAudit = await container.db.audit.purgeOldEntries(auditDate);
    const deletedCases = await container.db.moderation.purgeOldCases(caseDate);
    
    container.logger.info(`[DataRetention] Purged ${deletedAudit} audit ledger entries and ${deletedCases} moderation cases.`);
  } catch (error) {
    container.logger.error("[DataRetention] Sweep failed:", error);
  }
}

@DefineModule({
  name: "core",
  displayName: "Core",
  description: "The built-in core module.",
  short: "Essential bot commands, module management, and administrative panels.",
  endUserDataStatement:
    "Stores user IDs in permit assignments, system blocklists, and audit logs. Handled centrally during GDPR erasure.",
  emoji: Emojis.SHIELD,
  disableable: false,
  category: "System",
})
export class CoreModule extends Module {
  public constructor(
    context: Piece.LoaderContext,
    options: Piece.Options = {},
  ) {
    super(context, {
      ...options,
      name: "core",
      enabled: true,
      displayName: "Core",
      description: "The built-in core module.",
      emoji: Emojis.SHIELD,
    });
  }

  public override onLoad() {
    registerTaskFireHandler(
      "data-retention-sweep",
      "unicast",
      handleDataRetentionFire,
    );
  }
}
