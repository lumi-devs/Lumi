import { container } from "@sapphire/framework";
import { toStringArray } from "#lib/module-system/config-schema.js";
import { queueSend } from "#lib/outbound/send-queue.js";

const Module = "logging";

export const MessageLogChannelKey = "message_log_channel_id";
export const MemberLogChannelKey = "member_log_channel_id";
export const DefaultLogChannelKey = "log_channel_id";

/** Toggle key (as checked by `isToggleEnabled`) to its per-event channel key. */
export const LogEventChannels: Record<string, string> = {
  message_deletes: "message_deletes_channel_id",
  message_edits: "message_edits_channel_id",
  member_joins: "member_joins_channel_id",
  member_leaves: "member_leaves_channel_id",
  member_bans: "member_bans_channel_id",
  member_unbans: "member_unbans_channel_id",
  nickname_changes: "nickname_changes_channel_id",
  role_changes: "role_changes_channel_id",
};

/** Toggle key (as checked by `isToggleEnabled`) to its per-type channel key. */
export const LogToggleChannels: Record<string, string> = {
  message_deletes: MessageLogChannelKey,
  message_edits: MessageLogChannelKey,
  member_joins: MemberLogChannelKey,
  member_leaves: MemberLogChannelKey,
  member_bans: MemberLogChannelKey,
  member_unbans: MemberLogChannelKey,
  nickname_changes: MemberLogChannelKey,
  role_changes: MemberLogChannelKey,
};

export async function isToggleEnabled(
  guildId: string,
  toggleKey: string,
): Promise<boolean> {
  const toggle = await container.db.config.getModuleConfig(
    guildId,
    Module,
    toggleKey,
  );
  return toggle !== false;
}

/** Message events in these channels are skipped (e.g. staff/log channels). */
export async function isIgnoredChannel(
  guildId: string,
  channelId: string,
): Promise<boolean> {
  const stored = await container.db.config.getModuleConfig(
    guildId,
    Module,
    "ignored_channels",
  );
  const ignored = toStringArray(stored);
  return ignored.includes(channelId);
}

async function readChannelKey(
  guildId: string,
  key: string,
): Promise<string | null> {
  const stored = await container.db.config.getModuleConfig(
    guildId,
    Module,
    key,
  );
  return typeof stored === "string" && stored ? stored : null;
}

/**
 * Per-event channel first, then the category channel, then the default log
 * channel, then null (disabled).
 */
export async function resolveLogChannel(
  guildId: string,
  toggleKey: string,
): Promise<string | null> {
  const eventKey = LogEventChannels[toggleKey];
  if (eventKey) {
    const eventChannel = await readChannelKey(guildId, eventKey);
    if (eventChannel) return eventChannel;
  }
  const perTypeKey = LogToggleChannels[toggleKey];
  if (perTypeKey) {
    const perType = await readChannelKey(guildId, perTypeKey);
    if (perType) return perType;
  }
  return readChannelKey(guildId, DefaultLogChannelKey);
}

/**
 * Queue a log card for the guild's channel for `toggleKey`. Nothing waits on
 * a log card, so it goes through the outbound queue rather than an inline
 * REST call - a rate-limited log channel then parks one queue slot instead
 * of blocking the event handler that produced it.
 */
export async function sendLog(
  guildId: string,
  toggleKey: string,
  color: number,
  title: string,
  lines: string[],
): Promise<void> {
  const channelId = await resolveLogChannel(guildId, toggleKey);
  if (!channelId) return;

  await queueSend({ channelId, logCard: { color, title, lines } });
}
