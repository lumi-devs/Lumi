import {
  ComponentType,
  type GuildTextBasedChannel,
  type Message,
} from "discord.js";

export interface AwaitReplyOptions {
  timeoutMs?: number;
  prompt?: string;
}

async function collectOne(
  channel: GuildTextBasedChannel,
  userId: string,
  filter: (content: string) => boolean,
  timeoutMs: number,
): Promise<Message | null> {
  try {
    const collected = await channel.awaitMessages({
      filter: (m) => m.author.id === userId && filter(m.content),
      max: 1,
      time: timeoutMs,
      errors: ["time"],
    });
    return collected.first() ?? null;
  } catch {
    return null;
  }
}

async function sendPrompt(
  channel: GuildTextBasedChannel,
  prompt: string | undefined,
): Promise<void> {
  if (prompt) await channel.send(prompt);
}

export async function awaitReply(
  channel: GuildTextBasedChannel,
  userId: string,
  opts: AwaitReplyOptions & { match?: RegExp } = {},
): Promise<string | null> {
  await sendPrompt(channel, opts.prompt);
  const msg = await collectOne(
    channel,
    userId,
    (content) => (opts.match ? opts.match.test(content) : content.length > 0),
    opts.timeoutMs ?? 60_000,
  );
  return msg?.content ?? null;
}

const YesRe = /^(y|yes|yep|yeah|confirm|ok|okay)$/i;
const NoRe = /^(n|no|nope|cancel|abort)$/i;

export async function awaitYesNo(
  channel: GuildTextBasedChannel,
  userId: string,
  opts: AwaitReplyOptions = {},
): Promise<boolean | null> {
  await sendPrompt(channel, opts.prompt);
  const msg = await collectOne(
    channel,
    userId,
    (content) => YesRe.test(content.trim()) || NoRe.test(content.trim()),
    opts.timeoutMs ?? 60_000,
  );
  if (!msg) return null;
  return YesRe.test(msg.content.trim());
}

export async function awaitInt(
  channel: GuildTextBasedChannel,
  userId: string,
  opts: AwaitReplyOptions & { min?: number; max?: number } = {},
): Promise<number | null> {
  await sendPrompt(channel, opts.prompt);
  const msg = await collectOne(
    channel,
    userId,
    (content) => {
      if (!/^-?\d+$/.test(content.trim())) return false;
      const n = Number(content.trim());
      if (opts.min !== undefined && n < opts.min) return false;
      if (opts.max !== undefined && n > opts.max) return false;
      return true;
    },
    opts.timeoutMs ?? 60_000,
  );
  return msg ? Number(msg.content.trim()) : null;
}

export async function awaitChoice(
  channel: GuildTextBasedChannel,
  userId: string,
  choices: readonly string[],
  opts: AwaitReplyOptions = {},
): Promise<string | null> {
  const lowered = choices.map((c) => c.toLowerCase());
  await sendPrompt(channel, opts.prompt);
  const msg = await collectOne(
    channel,
    userId,
    (content) => lowered.includes(content.trim().toLowerCase()),
    opts.timeoutMs ?? 60_000,
  );
  if (!msg) return null;
  return choices[lowered.indexOf(msg.content.trim().toLowerCase())]!;
}

export async function awaitButton(
  message: Message,
  userId: string,
  customIds: readonly string[],
  timeoutMs = 60_000,
): Promise<string | null> {
  const wanted = new Set(customIds);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return null;
    let interaction;
    try {
      interaction = await message.awaitMessageComponent({
        componentType: ComponentType.Button,
        time: remaining,
      });
    } catch {
      return null;
    }
    if (interaction.user.id !== userId || !wanted.has(interaction.customId)) {
      await interaction.deferUpdate().catch(() => undefined);
      continue;
    }
    await interaction.deferUpdate().catch(() => undefined);
    return interaction.customId;
  }
}
