import "./preconditions/Administrator.js";
import "./preconditions/BotOwner.js";
import "./preconditions/GuildOwner.js";
import "./preconditions/MaintenanceMode.js";
import "./preconditions/Moderator.js";
import "./preconditions/ModuleEnabled.js";
import "./preconditions/NotBlocked.js";
import "./preconditions/NotIgnored.js";
import "./preconditions/PermissionOverrides.js";
import "./preconditions/RequirePermit.js";
import { PermitResolver } from "./PermitResolver.js";

export * from "./PermitResolver.js";

export enum PermissionLevel {
  EVERYONE = 0,
  USER = 1,
  MOD = 10,
  ADMIN = 20,
  GUILD_OWNER = 30,
  OWNER = 31,
  BOT_OWNER = 40,
}

export async function resolvePermissionLevel(target: unknown): Promise<number> {
  if (!target || typeof target !== "object") return PermissionLevel.EVERYONE;
  const t = target as Record<string, unknown>;
  const userId = (t.user as { id?: string })?.id ?? (t.author as { id?: string })?.id ?? t.userId as string;
  if (!userId) return PermissionLevel.EVERYONE;

  if (PermitResolver.isBotOwner(userId)) {
    return PermissionLevel.BOT_OWNER;
  }

  const guild = (t.guild as { ownerId: string, members?: { fetch: (id: string) => Promise<unknown> } }) ?? null;
  if (guild) {
    if (PermitResolver.isGuildOwner(guild.ownerId, userId)) {
      return PermissionLevel.GUILD_OWNER;
    }

    const member = (t.member as { permissions?: { has: (p: string) => boolean } }) ?? (await guild.members?.fetch(userId).catch(() => null) as { permissions?: { has: (p: string) => boolean } } | null);
    if (member && member.permissions) {
      if (member.permissions.has("Administrator")) {
        return PermissionLevel.ADMIN;
      }
      if (
        member.permissions.has("ManageGuild") ||
        member.permissions.has("ManageRoles") ||
        member.permissions.has("ManageChannels") ||
        member.permissions.has("BanMembers") ||
        member.permissions.has("KickMembers") ||
        member.permissions.has("ManageMessages")
      ) {
        return PermissionLevel.MOD;
      }
    }
  }

  return PermissionLevel.USER;
}
