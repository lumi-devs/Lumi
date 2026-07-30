import { container } from "@sapphire/framework";
import { type Guild, type GuildMember, type User, Colors } from "discord.js";
import { formatAuditReason } from "#lib/utilities/misc.js";
import { logToChannel, scheduleCaseLift } from "../lib/helpers.js";
import { BaseAction } from "./BaseAction.js";

export interface RestrictApplyOptions {
  guild: Guild;
  targetMember: GuildMember;
  moderator: User;
  reason: string;
  durationMs: number;
}

export interface RestrictUndoOptions {
  guild: Guild;
  targetMember: GuildMember;
  moderator: User;
  reason: string;
}

export class RestrictAction extends BaseAction {
  public static override async apply(options: RestrictApplyOptions) {
    const { guild, targetMember, moderator, reason, durationMs } = options;
    const expiresAt = new Date(Date.now() + durationMs);

    const restrictedRoleId = await container.db.config.getModuleConfig(
      guild.id,
      "mod",
      "restricted_role_id",
    );
    
    if (restrictedRoleId && typeof restrictedRoleId === "string") {
      await targetMember.roles.add(
        restrictedRoleId,
        formatAuditReason(moderator, reason),
      );
    } else {
      throw new Error("UNCONFIGURED");
    }

    const c = await container.db.moderation.createModerationCase({
      guildId: guild.id,
      userId: targetMember.id,
      moderatorId: moderator.id,
      action: "restrict",
      reason,
      durationSeconds: Math.floor(durationMs / 1000),
      expiresAt,
    });

    await scheduleCaseLift(container, c);

    await logToChannel(
      guild.id,
      "⛔ Restricted",
      Colors.Red,
      targetMember.id,
      moderator,
      reason,
      c.caseNumber,
    );

    return c;
  }

  public static async undo(options: RestrictUndoOptions) {
    const { guild, targetMember, moderator, reason } = options;
    const auditReason = formatAuditReason(moderator, reason);

    const restrictedRoleId = await container.db.config.getModuleConfig(
      guild.id,
      "mod",
      "restricted_role_id",
    );

    if (restrictedRoleId && typeof restrictedRoleId === "string") {
      await targetMember.roles.remove(restrictedRoleId, auditReason);
    }

    const c = await container.db.moderation.createModerationCase({
      guildId: guild.id,
      userId: targetMember.id,
      moderatorId: moderator.id,
      action: "unrestrict",
      reason,
    });

    await logToChannel(
      guild.id,
      "✅ Unrestricted",
      Colors.Green,
      targetMember.id,
      moderator,
      reason,
      c.caseNumber,
    );

    return c;
  }

  public static async undoRaw(
    guildId: string,
    targetId: string,
    reason: string,
  ): Promise<void> {
    const guild = await container.client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;
    
    const member = await guild.members.fetch(targetId).catch(() => null);
    if (!member) return;

    const restrictedRoleId = await container.db.config.getModuleConfig(
      guild.id,
      "mod",
      "restricted_role_id",
    );

    if (restrictedRoleId && typeof restrictedRoleId === "string") {
      await member.roles.remove(restrictedRoleId, reason).catch(() => null);
    }
  }
}
