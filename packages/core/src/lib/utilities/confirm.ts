import { randomUUID } from "node:crypto";
import {
  ComponentType,
  type Message,
  type GuildTextBasedChannel,
  type RepliableInteraction,
  type User,
} from "discord.js";
import { sendInteractionReply } from "#lib/utilities/command-response.js";
import { confirmRow } from "#lib/utilities/ui/kit.js";
import { makeWarningCard, type CardReply } from "#lib/utilities/cards.js";

/**
 * The slice of {@linkcode CommandContext} `confirmPrompt` actually needs -
 * satisfied by a real `CommandContext` (slash or prefix) and also by a
 * lightweight adapter for a flow that isn't a full command invocation (e.g. a
 * context-menu command's follow-up modal), so that flow can share this same
 * confirm-prompt machinery instead of re-implementing it.
 */
export interface ConfirmPromptContext {
  user: User;
  isSlash: boolean;
  interaction: RepliableInteraction;
  /** Only read when `isSlash` is false. */
  message?: Message;
}

export interface ConfirmPromptOptions {
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Milliseconds to wait for a click before resolving to `false`. */
  time?: number;
  /**
   * Send the prompt to this channel instead of via `ctx`'s interaction/message
   * reply. Use when `ctx`'s trigger message no longer exists (e.g. it was
   * already deleted) but the confirmation still needs to be posted somewhere.
   */
  channel?: GuildTextBasedChannel;
}

export interface ConfirmPromptResult {
  confirmed: boolean;
  /** The confirmation message, so callers can edit it in place afterward. */
  message: Message;
}

/**
 * Shows a Confirm/Cancel button prompt and resolves once the invoker clicks
 * one, or to `confirmed: false` if the prompt times out. Works uniformly
 * across the slash, prefix, and channel-send paths.
 */
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

  try {
    const click = await msg.awaitMessageComponent({
      filter: (i) => i.user.id === ctx.user.id,
      componentType: ComponentType.Button,
      time: opts.time ?? 30_000,
    });
    const confirmed = click.customId === confirmId;
    await click.deferUpdate().catch(() => {});
    return { confirmed, message: msg };
  } catch {
    return { confirmed: false, message: msg };
  }
}
