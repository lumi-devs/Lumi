import { Events } from "discord.js";
import {
  AuditLogEvent,
  type Guild,
  type GuildAuditLogsEntry,
} from "discord.js";
import { isNullish } from "@lumi/shared";
import type { Container } from "@lumi/lib/services.js";
import { defineListener } from "@lumi/lib/listeners/listener-def.js";
import { evaluateNukeEvent, type NukeKind } from "@lumi/application/services/security/anti-nuke.js";
import { flagRestorePending } from "@lumi/application/services/security/backup.js";

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
