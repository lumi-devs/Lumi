import { randomUUID } from "node:crypto";
import { ButtonStyle, ComponentType, type Message } from "discord.js";
import { confirmRow, makeWarningCard } from "@lumi/ui";
import type { CommandContext } from "./context.ts";

export interface ConfirmPromptOptions {
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmStyle?: ButtonStyle;
  timeMs?: number;
}

export interface ConfirmPromptResult {
  confirmed: boolean;
  message?: Message | null;
}

export async function confirmPrompt(
  ctx: CommandContext,
  opts: ConfirmPromptOptions,
): Promise<ConfirmPromptResult> {
  const id = randomUUID();
  const confirmId = `confirm:yes:${id}`;
  const cancelId = `confirm:no:${id}`;

  const row = confirmRow({
    confirmId,
    cancelId,
    confirmLabel: opts.confirmLabel ?? "Confirm",
    cancelLabel: opts.cancelLabel ?? "Cancel",
    confirmStyle: opts.confirmStyle ?? ButtonStyle.Danger,
  });

  const card = makeWarningCard(opts.title, opts.body, {
    actionRows: [row],
  });

  const reply = await ctx.reply(card);
  let msg: Message | null = null;

  if (ctx.isSlash && "fetchReply" in ctx.source) {
    msg = await ctx.source.fetchReply().catch(() => null);
  } else if (reply && typeof reply === "object" && "id" in reply) {
    msg = reply as Message;
  }

  if (!msg) {
    return { confirmed: false };
  }

  const deadline = Date.now() + (opts.timeMs ?? 30_000);
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
