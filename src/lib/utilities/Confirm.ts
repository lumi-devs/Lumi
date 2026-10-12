import { randomUUID } from "node:crypto";
import {
  ComponentType,
  type Message,
  type GuildTextBasedChannel,
  type RepliableInteraction,
  type User,
} from "discord.js";
import { sendInteractionReply } from "#src/lib/utilities/CommandResponse.js";
import { confirmRow } from "#src/lib/ui/Panels.js";
import { makeWarningCard, type CardReply } from "#src/lib/ui/Cards.js";

export interface ConfirmPromptContext {
  user: User;
  isSlash: boolean;
  interaction: RepliableInteraction;

  message?: Message;
}

export interface ConfirmPromptOptions {
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;

  time?: number;

  channel?: GuildTextBasedChannel;
}

export interface ConfirmPromptResult {
  confirmed: boolean;

  message: Message;
}

export async function confirmPrompt(
  ctx: ConfirmPromptContext,
  opts: ConfirmPromptOptions,
): Promise<ConfirmPromptResult> {
  const id = randomUUID();
  const confirmId = `lumi:confirm:yes:${id}`;
  const cancelId = `lumi:confirm:no:${id}`;

  const card: CardReply = makeWarningCard(opts.title, opts.body, {
    actionRows: [
      confirmRow({
        confirmId,
        cancelId,
        confirmLabel: opts.confirmLabel ?? "I understand, continue",
        cancelLabel: opts.cancelLabel ?? "Cancel",
      }),
    ],
  });

  let msg: Message;
  if (opts.channel) {
    msg = await opts.channel.send({ ...card, allowedMentions: {} });
  } else if (ctx.isSlash) {
    await sendInteractionReply(ctx.interaction, card, "edit");
    msg = await ctx.interaction.fetchReply();
  } else {
    msg = await ctx.message!.reply({ ...card, allowedMentions: {} });
  }

  const deadline = Date.now() + (opts.time ?? 30_000);
  while (Date.now() < deadline) {
    const click = await msg
      .awaitMessageComponent({
        componentType: ComponentType.Button,
        time: deadline - Date.now(),
      })
      .catch(() => null);
    if (!click) return { confirmed: false, message: msg };
    if (click.user.id !== ctx.user.id) {
      await click.deferUpdate().catch(() => undefined);
      continue;
    }
    const confirmed = click.customId === confirmId;
    await click.deferUpdate().catch(() => undefined);
    return { confirmed, message: msg };
  }
  return { confirmed: false, message: msg };
}
