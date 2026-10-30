import type { ModuleServices } from "@lumi/module-kit";
import type {
  APIInteractionGuildMember,
  ChatInputCommandInteraction,
  GuildMember,
} from "discord.js";
import { PermissionFlagsBits } from "discord.js";
import type { TempVcInteraction } from "./types.js";

function nodeMatches(granted: string, required: string): boolean {
  if (!granted || !required) return false;
  if (granted === "*" || granted === required) return true;
  if (granted.endsWith(".*")) {
    const namespace = granted.slice(0, -2);
    return required === namespace || required.startsWith(`${namespace}.`);
  }
  return false;
}

function roleIdsOf(
  member: GuildMember | APIInteractionGuildMember | null,
): string[] {
  if (!member) return [];
  const roles: unknown = member.roles;
  if (Array.isArray(roles)) {
    return roles.filter((roleId): roleId is string => typeof roleId === "string");
  }
  const cache = (roles as { cache?: Map<string, unknown> } | undefined)?.cache;
  return cache ? [...cache.keys()] : [];
}

export async function canUseTempVcAdmin(
  interaction: ChatInputCommandInteraction | TempVcInteraction,
  services: ModuleServices,
): Promise<boolean> {
  if (!interaction.guildId) return false;
  if (interaction.guild?.ownerId === interaction.user.id) return true;
  const member = interaction.member;
  const permissions = interaction.memberPermissions ?? member?.permissions;
  if (
    permissions &&
    typeof permissions !== "string" &&
    (permissions.has(PermissionFlagsBits.ManageGuild) ||
      permissions.has(PermissionFlagsBits.Administrator))
  ) {
    return true;
  }

  const repo = services.db.permits;
  if (!repo || typeof repo.getPermitChain !== "function") return false;

  const roleIds = roleIdsOf(member);

  try {
    const chain = await repo.getPermitChain(
      interaction.guildId,
      interaction.user.id,
      [
        { targetType: "USER", targetId: interaction.user.id },
        ...(interaction.channelId
          ? [{ targetType: "CHANNEL", targetId: interaction.channelId }]
          : []),
        ...roleIds.map((roleId) => ({ targetType: "ROLE", targetId: roleId })),
      ],
    );
    if (chain?.isQuarantined) return false;
    for (const tier of chain?.tiers ?? []) {
      const deny: string[] = tier?.custom?.deny ?? [];
      if (deny.some((node) => nodeMatches(node, "tempvc.admin"))) return false;
      const grant: string[] = tier?.custom?.grant ?? [];
      if (grant.some((node) => nodeMatches(node, "tempvc.admin"))) return true;
    }
  } catch (error) {
    services.observability?.logger?.warn?.("tempvc permit lookup failed", {
      guildId: interaction.guildId,
      userId: interaction.user.id,
      error,
    });
    return false;
  }
  return false;
}
