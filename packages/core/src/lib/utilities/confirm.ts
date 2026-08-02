import { ComponentType, type Message } from "discord.js";
import type { CommandContext } from "#lib/command-context.js";
import { sendInteractionReply } from "#lib/utilities/command-response.js";
import { confirmRow } from "#lib/utilities/ui/kit.js";
import { makeWarningCard, type CardReply } from "#lib/utilities/cards.js";

const CONFIRM_ID = "lumi:confirm:yes";
const CANCEL_ID = "lumi:confirm:no";

export interface ConfirmPromptOptions {
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Milliseconds to wait for a click before resolving to `false`. */
  time?: number;
}

/**
 * Shows a Confirm/Cancel button prompt and resolves once the invoker clicks
 * one, or to `false` if the prompt times out. Works uniformly across the
 * slash and prefix `CommandContext` paths.
 */
export async function confirmPrompt(
  ctx: CommandContext,
  opts: ConfirmPromptOptions,
): Promise<boolean> {
  const card: CardReply = makeWarningCard(opts.title, opts.body, {
    actionRows: [
      confirmRow({
        confirmId: CONFIRM_ID,
        cancelId: CANCEL_ID,
        confirmLabel: opts.confirmLabel ?? "I understand, continue",
        cancelLabel: opts.cancelLabel ?? "Cancel",
      }),
    ],
  });

  let msg: Message;
  if (ctx.isSlash) {
    await sendInteractionReply(ctx.interaction, card, "edit");
    msg = await ctx.interaction.fetchReply();
  } else {
    msg = await ctx.message.reply({ ...card, allowedMentions: {} });
  }

  try {
    const click = await msg.awaitMessageComponent({
      filter: (i) => i.user.id === ctx.user.id,
      componentType: ComponentType.Button,
      time: opts.time ?? 30_000,
    });
    const confirmed = click.customId === CONFIRM_ID;
    await click.deferUpdate().catch(() => {});
    return confirmed;
  } catch {
    return false;
  }
}
