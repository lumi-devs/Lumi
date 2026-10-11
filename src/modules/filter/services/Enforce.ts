import { type Container } from "#src/lib/Services.js";
import { Colors, PermissionsBitField } from "discord.js";
import { channelMention } from "@discordjs/formatters";
import { cutText, Time } from "#src/shared/Index.ts";
import { tryGetUtility } from "#src/lib/module-system/Utility.js";
import { toStringArray } from "#src/lib/module-system/ConfigSchema.js";
import type { GuildMessage } from "#src/lib/types/Common.js";
import { swallow } from "#src/lib/utilities/Errors.js";
import { deleteMessageLater } from "#src/lib/utilities/TemporaryMessage.js";
import { fetchTyped } from "#src/lib/i18n/Index.js";
import { getHitReason, type FilterHit } from "#src/modules/filter/services/Rules.js";
import type { FilterUtility } from "#src/modules/filter/utilities/FilterUtility.js";

async function isExempt(services: Container, message: GuildMessage): Promise<boolean> {
  const stored = await services.db.config.getModuleConfig(
    message.guildId,
    "filter",
    "exempt_roles",
  );
  const exemptRoles = toStringArray(stored);
  if (exemptRoles.length === 0) return false;
  const roles = message.member?.roles.cache;
  return roles ? exemptRoles.some((id) => roles.has(id)) : false;
}

async function warnUser(
  services: Container,
  message: GuildMessage,
  hit: FilterHit,
): Promise<void> {
  const t = await fetchTyped(message, services);
  const template = await services.db.config.getModuleConfig(
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

function groupTimeoutKey(rule: FilterHit["rule"]): string | null {
  if (rule === "invite") return "invite_timeout_minutes";
  if (rule === "link") return "link_timeout_minutes";
  if (rule === "mentions" || rule === "caps") return "spam_timeout_minutes";
  return null;
}

async function punish(
  services: Container,
  message: GuildMessage,
  hit: FilterHit,
): Promise<void> {
  const overrideKey = groupTimeoutKey(hit.rule);
  const override = overrideKey
    ? await services.db.config.getModuleConfig(
        message.guildId,
        "filter",
        overrideKey,
      )
    : null;
  const minutes =
    typeof override === "number" && override > 0
      ? override
      : await services.db.config.getModuleConfig(
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
  services: Container,
  message: GuildMessage,
  hit: FilterHit,
): Promise<void> {
  const logService = tryGetUtility("guild-log");
  await logService?.dispatch(services, {
    guildId: message.guildId,
    moduleName: "filter",
    action: `Filter - ${hit.rule}`,
    targetId: message.author.id,
    actorId: services.client.user!.id,
    reason: hit.detail,
    color: Colors.Red,
    extra: {
      Channel: channelMention(message.channelId),
      Message: cutText(message.content, 200),
    },
  });
}

export async function enforceHit(
  services: Container,
  message: GuildMessage,
  hit: FilterHit,
): Promise<void> {
  await message.delete().catch(swallow("Filter: delete filtered message"));
  await warnUser(services, message, hit);
  await Promise.all([punish(services, message, hit), logHit(services, message, hit)]);
}

export async function shouldScreen(
  services: Container,
  message: GuildMessage,
  filterService: FilterUtility,
): Promise<boolean> {
  if (message.member?.permissions.has(PermissionsBitField.Flags.ManageMessages))
    return false;

  if (!filterService.has(message.guildId)) {
    await filterService.loadGuild(services, message.guildId);
  }

  return !(await isExempt(services, message));
}

export async function runRules(
  services: Container,
  message: GuildMessage,
  filterService: FilterUtility,
  mentionCount: number,
): Promise<FilterHit | null> {
  return filterService.test(services, message.guildId, message.content, mentionCount);
}
