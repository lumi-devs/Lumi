import { container } from "@sapphire/framework";
import { Colors, PermissionsBitField } from "discord.js";
import { channelMention } from "@discordjs/formatters";
import { cutText } from "@sapphire/utilities";
import { Time } from "@sapphire/time-utilities";
import { tryGetUtility } from "#lib/module-system/Utility.js";
import { toStringArray } from "#lib/module-system/config-schema.js";
import type { GuildMessage } from "#lib/types/common.js";
import { swallow } from "#lib/utilities/errors.js";
import { deleteMessageLater } from "#lib/utilities/temporary-message.js";
import { fetchTyped } from "#lib/commands.js";
import { getHitReason, type FilterHit } from "./rules.js";
import type { FilterUtility } from "../utilities/FilterUtility.js";

async function isExempt(message: GuildMessage): Promise<boolean> {
  const stored = await container.db.config.getModuleConfig(
    message.guildId,
    "filter",
    "exempt_roles",
  );
  const exemptRoles = toStringArray(stored);
  if (exemptRoles.length === 0) return false;
  const roles = message.member?.roles.cache;
  return roles ? exemptRoles.some((id) => roles.has(id)) : false;
}

/** Transient warning with the configurable template; empty string disables. */
async function warnUser(
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

/** Per-group timeout override key for a hit; null means use the global one. */
function groupTimeoutKey(rule: FilterHit["rule"]): string | null {
  if (rule === "invite") return "invite_timeout_minutes";
  if (rule === "link") return "link_timeout_minutes";
  if (rule === "mentions" || rule === "caps") return "spam_timeout_minutes";
  return null;
}

/** Optional escalation: timeout the author for `timeout_minutes`. */
async function punish(
  message: GuildMessage,
  hit: FilterHit,
): Promise<void> {
  const overrideKey = groupTimeoutKey(hit.rule);
  const override = overrideKey
    ? await container.db.config.getModuleConfig(
        message.guildId,
        "filter",
        overrideKey,
      )
    : null;
  const minutes =
    typeof override === "number" && override > 0
      ? override
      : await container.db.config.getModuleConfig(
          message.guildId,
          "filter",
          "timeout_minutes",
        );
  if (typeof minutes !== "number" || minutes <= 0) return;
  await message.member
    ?.timeout(
      minutes * Time.Minute,
      `[Filter] Message matched ${hit.rule} rule (${hit.detail})`,
    )
    .catch(swallow("Filter: timeout member"));
}

async function logHit(
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
