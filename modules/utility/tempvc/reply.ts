import {
  type CardReply,
  ephemeralCard,
  makeErrorCard,
  makeSuccessCard,
} from "@lumi/ui";
import type { ChatInputCommandInteraction } from "discord.js";
import type { TempVcInteraction } from "./types.js";

type TempVcReplyTarget = ChatInputCommandInteraction | TempVcInteraction;

async function replyCard(
  interaction: TempVcReplyTarget,
  card: CardReply,
): Promise<void> {
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(card).catch(() => undefined);
    return;
  }
  await interaction.reply(card).catch(() => undefined);
}

export async function replyError(
  interaction: TempVcReplyTarget,
  title: string,
  body: string,
): Promise<void> {
  await replyCard(interaction, ephemeralCard(makeErrorCard(title, body)));
}

export async function replySuccess(
  interaction: TempVcReplyTarget,
  title: string,
  body: string,
): Promise<void> {
  await replyCard(interaction, ephemeralCard(makeSuccessCard(title, body)));
}

export async function showCard(
  interaction: TempVcInteraction,
  card: CardReply,
): Promise<void> {
  if (interaction.isModalSubmit() && !interaction.isFromMessage()) {
    await interaction.reply(card).catch(() => undefined);
    return;
  }
  try {
    await interaction.update(card);
  } catch {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(card).catch(() => undefined);
    } else {
      await interaction.reply(card).catch(() => undefined);
    }
  }
}
