import { Events } from "discord.js";
import {
  AuditLogEvent,
  type Guild,
  type GuildAuditLogsEntry,
} from "discord.js";
import { isNullish } from "#src/shared/Index.ts";
import type { Container } from "#src/lib/Services.js";
import { defineListener } from "#src/lib/listeners/ListenerDef.js";
import { evaluateNukeEvent, type NukeKind } from "#src/modules/security/services/AntiNuke.js";
import { flagRestorePending } from "#src/modules/security/services/Backup.js";

const KindByEvent: Partial<Record<AuditLogEvent, NukeKind>> = {
  [AuditLogEvent.MemberBanAdd]: "ban",
  [AuditLogEvent.MemberKick]: "kick",
  [AuditLogEvent.ChannelDelete]: "channel_delete",
  [AuditLogEvent.RoleDelete]: "role_delete",
  [AuditLogEvent.WebhookCreate]: "webhook_create",
};

export const SecurityAuditLogListener = defineListener({
  name: "securityAuditLogEntryCreate",
  event: Events.GuildAuditLogEntryCreate,
  module: "security",
  async execute(
    services: Container,
    entry: GuildAuditLogsEntry,
    guild: Guild,
  ): Promise<void> {
    const kind = KindByEvent[entry.action];
    if (!kind) return;
    const executorId = entry.executorId;
    if (isNullish(executorId)) return;

    if (
      (kind === "channel_delete" || kind === "role_delete") &&
      (await services.db.security.getPanicState(guild.id))
    ) {
      await flagRestorePending(guild.id);
    }

    await evaluateNukeEvent(guild, kind, () => executorId);
  },
});
