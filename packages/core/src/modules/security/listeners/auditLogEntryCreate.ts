import { Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import {
  AuditLogEvent,
  type Guild,
  type GuildAuditLogsEntry,
} from "discord.js";
import { isNullish } from "@sapphire/utilities";
import { ModuleListener } from "#lib/module-system/ModuleListener.js";
import { tryGetService } from "#lib/module-system/Service.js";
import type { NukeKind } from "../services/SecurityService.js";

const KIND_BY_EVENT: Partial<Record<AuditLogEvent, NukeKind>> = {
  [AuditLogEvent.MemberBanAdd]: "ban",
  [AuditLogEvent.MemberKick]: "kick",
  [AuditLogEvent.ChannelDelete]: "channel_delete",
  [AuditLogEvent.RoleDelete]: "role_delete",
  [AuditLogEvent.WebhookCreate]: "webhook_create",
};

@ApplyOptions<ModuleListener.Options>({
  name: "securityAuditLogEntryCreate",
  event: Events.GuildAuditLogEntryCreate,
  module: "security",
})
export class SecurityAuditLogListener extends ModuleListener<
  typeof Events.GuildAuditLogEntryCreate
> {
  protected async handle(
    entry: GuildAuditLogsEntry,
    guild: Guild,
  ): Promise<void> {
    const kind = KIND_BY_EVENT[entry.action];
    if (!kind) return;
    const executorId = entry.executorId;
    if (isNullish(executorId)) return;

    const security = tryGetService("security");
    if (!security) return;

    if (
      (kind === "channel_delete" || kind === "role_delete") &&
      (await this.container.db.security.getPanicState(guild.id))
    ) {
      await security.flagRestorePending(guild.id);
    }

    await security.evaluateNukeEvent(guild, kind, () => executorId);
  }
}
