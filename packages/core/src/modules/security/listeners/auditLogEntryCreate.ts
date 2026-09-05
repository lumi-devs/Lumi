import { Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import {
  AuditLogEvent,
  type Guild,
  type GuildAuditLogsEntry,
} from "discord.js";
import { isNullish } from "@sapphire/utilities";
import { ModuleListener } from "#lib/module-system/ModuleListener.js";
import { tryGetUtility } from "#lib/module-system/Utility.js";
import type { NukeKind } from "../utilities/SecurityUtility.js";

const KindByEvent: Partial<Record<AuditLogEvent, NukeKind>> = {
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
    const kind = KindByEvent[entry.action];
    if (!kind) return;
    const executorId = entry.executorId;
    if (isNullish(executorId)) return;

    const security = tryGetUtility("security");
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
