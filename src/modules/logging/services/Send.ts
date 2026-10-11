import { type Container } from "#src/lib/Services.js";
import { toStringArray } from "#src/lib/module-system/ConfigSchema.js";
import { queueSend } from "#src/lib/outbound/SendQueue.js";

const Module = "logging";

const MessageLogChannelKey = "message_log_channel_id";
const MemberLogChannelKey = "member_log_channel_id";
const DefaultLogChannelKey = "log_channel_id";

const LogEventChannels: Record<string, string> = {
  message_deletes: "message_deletes_channel_id",
  message_edits: "message_edits_channel_id",
  member_joins: "member_joins_channel_id",
  member_leaves: "member_leaves_channel_id",
  member_bans: "member_bans_channel_id",
  member_unbans: "member_unbans_channel_id",
  nickname_changes: "nickname_changes_channel_id",
  role_changes: "role_changes_channel_id",
};

const LogToggleChannels: Record<string, string> = {
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
  services: Container,
  guildId: string,
  toggleKey: string,
): Promise<boolean> {
  const toggle = await services.db.config.getModuleConfig(
    guildId,
    Module,
    toggleKey,
  );
  return toggle !== false;
}

export async function isIgnoredChannel(
  services: Container,
  guildId: string,
  channelId: string,
): Promise<boolean> {
  const stored = await services.db.config.getModuleConfig(
    guildId,
    Module,
    "ignored_channels",
  );
  const ignored = toStringArray(stored);
  return ignored.includes(channelId);
}

async function readChannelKey(
  services: Container,
  guildId: string,
  key: string,
): Promise<string | null> {
  const stored = await services.db.config.getModuleConfig(
    guildId,
    Module,
    key,
  );
  return typeof stored === "string" && stored ? stored : null;
}

export async function resolveLogChannel(
  services: Container,
  guildId: string,
  toggleKey: string,
): Promise<string | null> {
  const eventKey = LogEventChannels[toggleKey];
  if (eventKey) {
    const eventChannel = await readChannelKey(services, guildId, eventKey);
    if (eventChannel) return eventChannel;
  }
  const perTypeKey = LogToggleChannels[toggleKey];
  if (perTypeKey) {
    const perType = await readChannelKey(services, guildId, perTypeKey);
    if (perType) return perType;
  }
  return readChannelKey(services, guildId, DefaultLogChannelKey);
}

export async function sendLog(
  services: Container,
  guildId: string,
  toggleKey: string,
  color: number,
  title: string,
  lines: string[],
): Promise<void> {
  const channelId = await resolveLogChannel(services, guildId, toggleKey);
  if (!channelId) return;

  await queueSend(services, { channelId, logCard: { color, title, lines } });
}
