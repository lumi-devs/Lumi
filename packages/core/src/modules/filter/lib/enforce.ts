import { container } from "@sapphire/framework";
import { Colors, PermissionsBitField } from "discord.js";
import { channelMention } from "@discordjs/formatters";
import { cutText } from "@sapphire/utilities";
import { getUtility, tryGetUtility } from "#lib/module-system/Utility.js";
import type { GuildMessage } from "#lib/types/common.js";
import { swallow } from "#lib/utilities/errors.js";
import { deleteMessageLater } from "#lib/utilities/temporary-message.js";
import { fetchTyped } from "#lib/commands.js";
import { getHitReason, type FilterHit } from "./rules.js";
import type { FilterUtility } from "../utilities/FilterUtility.js";

export async function isExempt(message: GuildMessage): Promise<boolean> {
  const exemptRoles = await getUtility("config").getConfigList(
    message.guildId,
    "filter",
    "exempt_roles",
  );
  if (exemptRoles.length === 0) return false;
  const roles = message.member?.roles.cache;
  return roles ? exemptRoles.some((id) => roles.has(id)) : false;
}

/** Transient warning with the configurable template; empty string disables. */
export async function warnUser(
  message: GuildMessage,
  hit: FilterHit,
): Promise<void> {
  const t = await fetchTyped(message);
  const template = await container.db.config.getModuleConfig(
    message.guildId,
    "filter",
    "warn_message",
  );
  const defaultTemplate = t("filter:defaultWarnMessage");
  const reasonText = getHitReason(t, hit.rule);
  const text = (typeof template === "string" ? template : defaultTemplate)
    .replaceAll("{user}", message.author.toString())
    .replaceAll("{reason}", reasonText)
    .trim();
  if (!text) return;

  const warn = await message.channel
    .send(text)
    .catch(swallow("Filter: send warning"));
  if (warn) deleteMessageLater(warn, undefined, "Filter: delete warning");
}

/** Optional escalation: timeout the author for `timeout_minutes`. */
export async function punish(
  message: GuildMessage,
  hit: FilterHit,
): Promise<void> {
  const minutes = await container.db.config.getModuleConfig(
    message.guildId,
    "filter",
    "timeout_minutes",
  );
  if (typeof minutes !== "number" || minutes <= 0) return;
  await message.member
    ?.timeout(
      minutes * 60_000,
      `[Filter] Message matched ${hit.rule} rule (${hit.detail})`,
    )
    .catch(swallow("Filter: timeout member"));
}

export async function logHit(
  message: GuildMessage,
  hit: FilterHit,
): Promise<void> {
  const logService = tryGetUtility("guild-log");
  await logService?.dispatch({
    guildId: message.guildId,
    moduleName: "filter",
    action: `Filter - ${hit.rule}`,
    targetId: message.author.id,
    actorId: container.client.user!.id,
    reason: hit.detail,
    color: Colors.Red,
    extra: {
      Channel: channelMention(message.channelId),
      Message: cutText(message.content, 200),
    },
  });
}

/** Delete the offending message and run warn/punish/log for a confirmed hit. */
export async function enforceHit(
  message: GuildMessage,
  hit: FilterHit,
): Promise<void> {
  await message.delete().catch(swallow("Filter: delete filtered message"));
  await warnUser(message, hit);
  await Promise.all([punish(message, hit), logHit(message, hit)]);
}

/**
 * Whether this author's messages are subject to the filter at all. Also warms
 * the guild's compiled rules, so callers may evaluate immediately after.
 *
 * Kept separate from `runRules` because the create path counts mentions toward
 * the flood guard between the two, and that counter must only ever see
 * non-exempt, non-privileged authors.
 */
export async function shouldScreen(
  message: GuildMessage,
  filterService: FilterUtility,
): Promise<boolean> {
  if (message.member?.permissions.has(PermissionsBitField.Flags.ManageMessages))
    return false;

  if (!filterService.has(message.guildId)) {
    await filterService.loadGuild(message.guildId);
  }

  return !(await isExempt(message));
}

export async function runRules(
  message: GuildMessage,
  filterService: FilterUtility,
  mentionCount: number,
): Promise<FilterHit | null> {
  return filterService.test(message.guildId, message.content, mentionCount);
}
