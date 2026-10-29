import { PermissionFlagsBits, type GuildMember } from "discord.js";

function nodeMatches(granted: string, required: string): boolean {
  if (!granted || !required) return false;
  if (granted === "*" || granted === required) return true;
  if (granted.endsWith(".*")) {
    const namespace = granted.slice(0, -2);
    return required === namespace || required.startsWith(`${namespace}.`);
  }
  return false;
}

export async function canUseTempVcAdmin(
  interaction: any,
  services: any,
): Promise<boolean> {
  if (!interaction.guildId) return false;
  if (interaction.guild?.ownerId === interaction.user.id) return true;
  const member = interaction.member as GuildMember | null;
  const permissions = interaction.memberPermissions ?? member?.permissions;
  if (
    permissions?.has?.(PermissionFlagsBits.ManageGuild) ||
    permissions?.has?.(PermissionFlagsBits.Administrator)
  ) {
    return true;
  }

  const repo = services?.db?.permits;
  if (!repo || typeof repo.getPermitChain !== "function") return false;

  const roleIds = member?.roles?.cache
    ? [...member.roles.cache.keys()]
    : Array.isArray((member as any)?.roles)
      ? ((member as any).roles as string[])
      : [];

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
  } catch {
    return false;
  }
  return false;
}
