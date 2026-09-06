import {
  ChannelType,
  PermissionFlagsBits,
  type Guild,
  type GuildBasedChannel,
  type GuildTextBasedChannel,
  type NewsChannel,
  type TextChannel,
} from "discord.js";
import { mapWithConcurrency } from "#lib/utilities/concurrency.js";

export type AnnounceOutcome = "sent" | "failed" | "skipped";

export interface AnnounceResult {
  guildId: string;
  outcome: AnnounceOutcome;
}

export interface AnnounceSummary {
  sent: number;
  failed: number;
  skipped: number;
  results: AnnounceResult[];
}

export function summarizeAnnounce(results: AnnounceResult[]): AnnounceSummary {
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const result of results) {
    if (result.outcome === "sent") sent++;
    else if (result.outcome === "failed") failed++;
    else skipped++;
  }
  return { sent, failed, skipped, results };
}

type PositionedChannel = TextChannel | NewsChannel;

function isSendableChannel(
  channel: GuildBasedChannel,
  me: Guild["members"]["me"],
): channel is PositionedChannel {
  if (channel.isDMBased() || channel.isThread() || !channel.isTextBased()) {
    return false;
  }
  if (
    channel.type !== ChannelType.GuildText &&
    channel.type !== ChannelType.GuildAnnouncement
  ) {
    return false;
  }
  if (!me) return channel.viewable;
  return (
    channel
      .permissionsFor(me)
      ?.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
      ]) ?? false
  );
}

/**
 * Contained announce-target resolver: the guild's configured announce
 * channel first, then the system channel, then the lowest-position writable
 * text channel. Returns null when nothing is sendable.
 */
export function resolveAnnounceChannel(
  guild: Guild,
  configuredChannelId?: string | null,
): GuildTextBasedChannel | null {
  try {
    const me = guild.members.me;
    if (configuredChannelId) {
      const configured = guild.channels.cache.get(configuredChannelId);
      if (configured && isSendableChannel(configured, me)) {
        return configured;
      }
    }
    const system = guild.systemChannel;
    if (system && isSendableChannel(system, me)) return system;
    return (
      (guild.channels.cache
        .filter((candidate: GuildBasedChannel): candidate is PositionedChannel =>
          isSendableChannel(candidate, me),
        )
        .sort((a, b) => a.position - b.position)
        .first() as GuildTextBasedChannel | undefined) ?? null
    );
  } catch {
    return null;
  }
}

const AnnounceConcurrency = 3;
const AnnounceStaggerMs = 750;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Delivers `deliver` to every guild with bounded concurrency and a stagger
 * pause after each send so fleet-wide broadcasts stay under rate limits.
 * A throwing `deliver` counts as `failed` rather than aborting the batch.
 */
export async function runGlobalAnnounce<T extends { id: string }>(
  guilds: readonly T[],
  deliver: (guild: T) => Promise<AnnounceOutcome>,
  opts: { concurrency?: number; staggerMs?: number } = {},
): Promise<AnnounceSummary> {
  const staggerMs = opts.staggerMs ?? AnnounceStaggerMs;
  const results: AnnounceResult[] = [];
  await mapWithConcurrency(
    guilds,
    opts.concurrency ?? AnnounceConcurrency,
    async (guild) => {
      try {
        results.push({ guildId: guild.id, outcome: await deliver(guild) });
      } catch {
        results.push({ guildId: guild.id, outcome: "failed" });
      } finally {
        if (staggerMs > 0) await sleep(staggerMs);
      }
    },
  );
  return summarizeAnnounce(results);
}
