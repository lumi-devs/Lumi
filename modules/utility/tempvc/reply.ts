import {
  type CardReply,
  ephemeralCard,
  makeErrorCard,
  makeSuccessCard,
} from "@lumi/ui";

async function replyCard(interaction: any, card: CardReply): Promise<void> {
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(card).catch(() => undefined);
    return;
  }
  await interaction.reply(card).catch(() => undefined);
}

export async function replyError(
  interaction: any,
  title: string,
  body: string,
): Promise<void> {
  await replyCard(interaction, ephemeralCard(makeErrorCard(title, body)));
}

export async function replySuccess(
  interaction: any,
  title: string,
  body: string,
): Promise<void> {
  await replyCard(interaction, ephemeralCard(makeSuccessCard(title, body)));
}

export async function showCard(
  interaction: any,
  card: CardReply,
): Promise<void> {
  if (interaction.isModalSubmit?.() && !interaction.isFromMessage?.()) {
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
