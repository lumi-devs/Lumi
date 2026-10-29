import type {
  ChatInputCommandInteraction,
  GuildMember,
  GuildTextBasedChannel,
  User,
} from "discord.js";
import {
  ephemeralCard,
  makeErrorCard,
  makeSuccessCard,
  makeWarningCard,
  type CardReply,
} from "@lumi/ui";
import type { ModerationConfig } from "./config.js";

export function isTextGuildChannel(
  channel: any,
): channel is GuildTextBasedChannel & { permissionOverwrites: any } {
  return (
    channel?.isTextBased?.() &&
    "permissionOverwrites" in channel &&
    !channel.isThread?.()
  );
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function getTargets(
  interaction: ChatInputCommandInteraction,
  maxTargets: number,
): Promise<User[]> {
  const single = interaction.options.getUser("user");
  const extra = interaction.options.getString("users");
  const ids = new Set(
    extra
      ? extra.split(/\s+/).filter((s) => /^\d{17,19}$/.test(s))
      : [],
  );
  if (single) ids.add(single.id);

  const fetched = await Promise.all(
    [...ids].map((id) =>
      interaction.client.users.fetch(id).catch(() => null),
    ),
  );
  return fetched
    .filter((user): user is User => user !== null)
    .slice(0, maxTargets);
}

export function isImmune(
  member: GuildMember | null,
  config: ModerationConfig,
): boolean {
  return Boolean(
    member &&
      config.immuneRoleIds.some((roleId) => member.roles.cache.has(roleId)),
  );
}

export function getReason(interaction: ChatInputCommandInteraction): string {
  return interaction.options.getString("reason") ?? "No reason provided";
}

export function getDeleteDays(
  interaction: ChatInputCommandInteraction,
): number {
  return interaction.options.getInteger("delete_days") ?? 0;
}

export function actionCard(
  title: string,
  lines: string[],
  failures: number,
  total: number,
): CardReply {
  if (failures === 0) return makeSuccessCard(title, lines);
  if (failures >= total) return makeErrorCard(title, lines);
  return makeWarningCard(title, lines);
}

export async function replyError(
  interaction: ChatInputCommandInteraction,
  title: string,
  body: string,
): Promise<void> {
  await interaction.reply(ephemeralCard(makeErrorCard(title, body)));
}
