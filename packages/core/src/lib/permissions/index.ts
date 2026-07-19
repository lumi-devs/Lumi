import { envParseString } from "#lib/env.js";
import { container } from "@sapphire/framework";
import type {
  Message,
  ChatInputCommandInteraction,
  ContextMenuCommandInteraction,
  PermissionsBitField,
  GuildMemberRoleManager,
} from "discord.js";
import { BotConfig } from "#lib/utilities/config.js";

const OWNER_IDS: ReadonlySet<string> = new Set(
  envParseString("OWNER_IDS", "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),
);

export enum PermissionLevel {
  USER = 0,
  MOD = 5,
  ADMIN = 7,
  GUILD_OWNER = 8,
  BOT_OWNER = 10,
}

export const PERMISSION_LEVEL_NAMES: Record<PermissionLevel, string> = {
  [PermissionLevel.USER]: BotConfig.permissions.names.USER,
  [PermissionLevel.MOD]: BotConfig.permissions.names.MOD,
  [PermissionLevel.ADMIN]: BotConfig.permissions.names.ADMIN,
  [PermissionLevel.GUILD_OWNER]: BotConfig.permissions.names.GUILD_OWNER,
  [PermissionLevel.BOT_OWNER]: BotConfig.permissions.names.BOT_OWNER,
};

export type PermissionModelType =
  "user" | "role" | "channel" | "category" | "everyone";

export interface PermissionContext {
  userId: string;
  guild?: { id: string; ownerId: string } | null;
  member?: {
    permissions: PermissionsBitField;
    roles: GuildMemberRoleManager;
  } | null;
}

export async function resolvePermissionLevel(
  interactionOrMessage:
    | Message
    | ChatInputCommandInteraction
    | ContextMenuCommandInteraction
    | PermissionContext,
): Promise<PermissionLevel> {
  const user =
    "author" in interactionOrMessage
      ? interactionOrMessage.author
      : "user" in interactionOrMessage
        ? interactionOrMessage.user
        : undefined;
  const userId =
    user?.id ??
    ("userId" in interactionOrMessage
      ? interactionOrMessage.userId
      : undefined);
  if (userId && OWNER_IDS.has(userId)) return PermissionLevel.BOT_OWNER;

  const app = container.client?.application;
  if (userId && app) {
    if (app.owner) {
      if ("members" in app.owner) {
        if (app.owner.members.has(userId)) return PermissionLevel.BOT_OWNER;
      } else if (app.owner.id === userId) return PermissionLevel.BOT_OWNER;
    }
  }

  const { guild, member } = interactionOrMessage;
  if (!guild || !member) return PermissionLevel.USER;

  const perms = member.permissions as PermissionsBitField;
  const roles = member.roles as GuildMemberRoleManager;

  if (userId && guild.ownerId === userId) return PermissionLevel.GUILD_OWNER;
  if (perms.has("Administrator")) return PermissionLevel.ADMIN;

  try {
    const settings = await container.db.config.getGuildSettings(guild.id);
    if (settings.adminRoleId && roles.cache.has(settings.adminRoleId))
      return PermissionLevel.ADMIN;
    if (perms.has("ManageMessages")) return PermissionLevel.MOD;
    if (settings.modRoleId && roles.cache.has(settings.modRoleId))
      return PermissionLevel.MOD;
  } catch (err: unknown) {
    container.logger.error(
      "[Permissions] Failed to fetch guild settings:",
      err,
    );
  }

  return PermissionLevel.USER;
}
