import {
  ephemeralCard,
  makeErrorCard,
  makeSuccessCard,
  type CardReply,
} from "@lumi/ui";

export async function replyError(
  interaction: any,
  title: string,
  body: string,
): Promise<void> {
  const card = ephemeralCard(makeErrorCard(title, body));
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(card).catch(() => undefined);
    return;
  }
  await interaction.reply(card).catch(() => undefined);
}

export async function replySuccess(
  interaction: any,
  title: string,
  body: string,
): Promise<void> {
  const card = ephemeralCard(makeSuccessCard(title, body));
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(card).catch(() => undefined);
    return;
  }
  await interaction.reply(card).catch(() => undefined);
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
