import { time, userMention, type Guild, type User } from "discord.js";
import type { LumiServices, ModerationCase } from "@lumi/module-kit";
import {
  makeCard,
  makeInfoCard,
  resolveCardColor,
  type CardReply,
} from "@lumi/ui";
import type { CreateCaseInput } from "@lumi/db";
import { getModConfig } from "./config.ts";

const ActionColors: Partial<Record<ModerationCase["action"], "error" | "warning" | "info">> = {
  ban: "error",
  softban: "error",
  kick: "warning",
  mute: "warning",
  voice_mute: "warning",
  warn: "warning",
  quarantine: "warning",
};

export function recordCase(
  services: LumiServices,
  guildId: string,
  input: CreateCaseInput,
): Promise<ModerationCase> {
  return services.db.moderation.createCase(guildId, input);
}

export async function notifyPunishedUser(
  services: LumiServices,
  guild: Guild,
  user: User,
  action: string,
  reason: string | null,
): Promise<boolean> {
  const config = await getModConfig(services, guild.id).catch(() => null);
  if (!config?.dm_on_punish) return false;

  const card = makeInfoCard(
    `Moderation Notice: ${guild.name}`,
    [
      `You received a **${action.toUpperCase()}** in **${guild.name}**.`,
      "",
      `**Reason:** ${reason ?? "No reason provided."}`,
    ].join("\n"),
  );

  return user
    .send(card)
    .then(() => true)
    .catch((error: unknown) => {
      services.logger.debug({ error, userId: user.id, guildId: guild.id }, "moderation DM failed");
      return false;
    });
}

export async function logModAction(
  services: LumiServices,
  guild: Guild,
  modCase: ModerationCase,
): Promise<void> {
  try {
    const config = await getModConfig(services, guild.id);
    if (!config.log_channel_id) return;

    const channel = await guild.channels.fetch(config.log_channel_id).catch(() => null);
    if (!channel?.isSendable() || !channel.isTextBased()) return;

    const lines = [
      `**Action:** \`${modCase.action.toUpperCase()}\` • **Case:** \`#${modCase.caseNumber}\``,
      `**Target:** ${userMention(modCase.userId)} (\`${modCase.userId}\`)`,
      `**Moderator:** ${userMention(modCase.moderatorId)} (\`${modCase.moderatorId}\`)`,
      `**Reason:** ${modCase.reason ?? "No reason provided."}`,
      `**Timestamp:** ${time(modCase.createdAt, "F")} (${time(modCase.createdAt, "R")})`,
    ];

    if (modCase.expiresAt) {
      lines.push(`**Expires:** ${time(modCase.expiresAt, "R")}`);
    }

    const color = resolveCardColor(ActionColors[modCase.action] ?? "info");
    const card: CardReply = makeCard(color, `Moderation Log #${modCase.caseNumber}`, lines.join("\n"), {
      breadcrumbs: ["Mod Log", modCase.action.toUpperCase()],
    });

    await channel.send(card);
  } catch (error) {
    services.logger.warn(
      { error, guildId: guild.id, caseNumber: modCase.caseNumber },
      "failed to write moderation log",
    );
  }
}
