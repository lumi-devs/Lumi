import { container } from "#src/lib/Services.js";
import { PermissionFlagsBits, PermissionsBitField } from "discord.js";
import { PermitResolver } from "#src/lib/permissions/PermitResolver.js";

export interface Actor {
  userId: string;
  guildId?: string | undefined;
  guildOwnerId?: string | null | undefined;
  roleIds?: readonly string[] | undefined;
  channelId?: string | undefined;
  memberPermissions?: PermissionsBitField | bigint | null;
}

export type AuthorizationRequirement =
  | { kind: "permit"; node: string }
  | { kind: "botOwner" }
  | { kind: "guildOwner" }
  | { kind: "guildManager" };

function isGuildManager(memberPermissions: Actor["memberPermissions"]): boolean {
  if (memberPermissions == null) return false;
  const bits =
    memberPermissions instanceof PermissionsBitField
      ? memberPermissions
      : new PermissionsBitField(memberPermissions);
  return bits.has(PermissionFlagsBits.ManageGuild) || bits.has(PermissionFlagsBits.Administrator);
}

export async function authorize(
  actor: Actor,
  requirement: AuthorizationRequirement,
): Promise<boolean> {
  switch (requirement.kind) {
    case "botOwner":
      return PermitResolver.isBotOwner(actor.userId);
    case "guildOwner":
      return PermitResolver.isGuildOwner(actor.guildOwnerId, actor.userId);
    case "guildManager":
      return isGuildManager(actor.memberPermissions);
    case "permit":
      if (!actor.guildId) return false;
      return container.permitResolver.hasPermit({
        guildId: actor.guildId,
        userId: actor.userId,
        roleIds: actor.roleIds ? [...actor.roleIds] : undefined,
        channelId: actor.channelId,
        guildOwnerId: actor.guildOwnerId ?? undefined,
        permitNode: requirement.node,
      });
  }
}
