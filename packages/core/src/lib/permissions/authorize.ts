import { container } from "#lib/services.js";
import { PermissionFlagsBits, PermissionsBitField } from "discord.js";
import { PermitResolver } from "#lib/permissions/PermitResolver.js";

/**
 * Everything an authorization decision needs about the caller. Deliberately
 * loose/optional on every field but `userId` - callers pass whatever their
 * environment actually has (a Discord interaction's already-resolved
 * `memberPermissions`, a REST-derived permission bitfield, role ids off a
 * gateway member) rather than being forced through one canonical shape.
 */
export interface Actor {
  userId: string;
  guildId?: string;
  guildOwnerId?: string | null;
  roleIds?: readonly string[];
  channelId?: string;
  memberPermissions?: PermissionsBitField | bigint | null;
}

/**
 * The "may this actor do X" question, as a closed set - never a free-form
 * string or boolean flag. Adding a new kind of authorization decision means
 * extending this union (and `authorize`'s switch), not inventing a new
 * ad-hoc check at a call site.
 */
export type AuthorizationRequirement =
  | { kind: "permit"; node: string }
  | { kind: "botOwner" }
  | { kind: "guildOwner" }
  | { kind: "guildManager" };

function isGuildManager(memberPermissions: Actor["memberPermissions"]): boolean {
  if (memberPermissions === null || memberPermissions === undefined) return false;
  const bits =
    memberPermissions instanceof PermissionsBitField
      ? memberPermissions
      : new PermissionsBitField(memberPermissions);
  return bits.has(PermissionFlagsBits.ManageGuild) || bits.has(PermissionFlagsBits.Administrator);
}

/**
 * The one place every "what may you do" decision is evaluated - commands
 * (via the gate checks), RPC handlers, and the addon SDK (via
 * `CommandContext`) all resolve through here rather than each re-deriving
 * "is this a bot owner"/"does this bitfield count as a guild manager" for
 * itself. It never authenticates (no token/session/interaction-user
 * resolution happens here) - callers must already know who `actor` is.
 */
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
