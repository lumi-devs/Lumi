import type { ModuleServices } from "@lumi/module-kit";
import { ephemeralCard, makeErrorCard } from "@lumi/ui";
import {
  type ChatInputCommandInteraction,
  type Guild,
  GuildMember,
} from "discord.js";
import { canManage } from "../engine.js";

function memberOf(
  interaction: ChatInputCommandInteraction,
): GuildMember | null {
  return interaction.member instanceof GuildMember ? interaction.member : null;
}

export async function guildMember(
  interaction: ChatInputCommandInteraction,
  guild: Guild,
): Promise<GuildMember | null> {
  const member = memberOf(interaction);
  if (member) return member;
  return guild.members.fetch(interaction.user.id).catch(() => null);
}

export async function requireManage(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  guild: Guild,
): Promise<boolean> {
  const member =
    interaction.member instanceof GuildMember
      ? interaction.member
      : await guild.members.fetch(interaction.user.id).catch(() => null);
  const allowed = await canManage(
    {
      guildId: guild.id,
      guildOwnerId: guild.ownerId,
      userId: interaction.user.id,
      member,
      ...(interaction.channelId ? { channelId: interaction.channelId } : {}),
    },
    services,
  );
  if (!allowed) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Management Only",
          "You need **Manage Server** or the **cc.manage** permit to manage custom commands.",
        ),
      ),
    );
  }
  return allowed;
}
