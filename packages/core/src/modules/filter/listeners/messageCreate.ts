import { Time } from "@lumi/shared";
import { getUtility, tryGetUtility } from "@lumi/lib/module-system/utility.js";
import { Colors } from "discord.js";
import { channelMention } from "@discordjs/formatters";
import { LumiEvents } from "@lumi/lib/types/common.js";
import type { GuildMessage } from "@lumi/lib/types/common.js";
import { defineListener } from "@lumi/lib/listeners/listener-def.js";
import type { Container } from "@lumi/lib/services.js";
import type { FilterUtility } from "../utilities/FilterUtility.js";
import { enforceHit, runRules, shouldScreen } from "@lumi/application/services/filter/enforce.js";
import {
  containsLink,
  countEmoji,
  escalatedTimeoutMinutes,
  heatAction,
  isZalgo,
  type HeatConfig,
} from "@lumi/application/services/filter/heat.js";
import { QuarantineAction } from "@lumi/application/services/mod/actions/quarantine-action.js";
import { isImmuneToAutomatedAction } from "@lumi/application/services/mod/immune-roles.js";
import { lockAllTextChannels } from "@lumi/lib/discord/channel-locks.js";
import { scheduleTask } from "@lumi/lib/scheduler/schedule.js";
import { swallow } from "@lumi/lib/utilities/errors.js";
import { deleteMessageLater } from "@lumi/lib/utilities/temporary-message.js";
import { fetchTyped } from "@lumi/lib/i18n/index.js";

export const FilterMessageListener = defineListener({
  name: "filterMessageCreate",
  event: LumiEvents.GuildUserMessage,
  module: "filter",
  async execute(services: Container, message: GuildMessage): Promise<void> {
    const filterService: FilterUtility = getUtility("filter");
    if (!(await shouldScreen(services, message, filterService))) return;

    const mentionCount =
      message.mentions.users.size + message.mentions.roles.size;

    await mentionFlood(services, message, mentionCount, filterService);

    const hit = await runRules(services, message, filterService, mentionCount);

    const heat = filterService.getHeat(message.guildId);
    const heatActive = heat?.enabled === true;
    if (!hit && !heatActive) return;

    if (hit) await enforceHit(services, message, hit);

    if (heatActive) await heatCheck(services, message, mentionCount, hit !== null, heat, filterService);
  },
});

  /**
   * Server-wide flood guard, independent of the Heat System: once non-exempt
   * mentions in the guild cross `lockdownMentionThreshold` within the window,
   * every text channel is locked for `lockdownDurationMinutes` and an
   * auto-unlock job is scheduled so the lock lifts even across a restart.
   */
async function mentionFlood(
  services: Container,
  message: GuildMessage,
  mentionCount: number,
  filterService: FilterUtility,
): Promise<void> {
    if (mentionCount <= 0) return;
    const config = filterService.getHeat(message.guildId);
    if (!config || config.lockdownMentionThreshold <= 0) return;

    const total = await filterService.recordMentions(services, 
      message.guildId,
      mentionCount,
      config.lockdownWindowSeconds,
    );
    if (total < config.lockdownMentionThreshold) return;

    const activated = await filterService.activateAutoLockdown(services, 
      message.guildId,
      config.lockdownDurationMinutes,
    );
    if (!activated) return;

    // Schedule the unlock before locking anything. If this fails there is no
    // restart reconciliation for filter lockdowns, so locking first would leave
    // the guild silently locked until an admin noticed - worse than the raid.
    // A stray unlock job for a guild that never got locked is a no-op.
    try {
      await scheduleTask(
        "filter-auto-lockdown-unlock",
        { guildId: message.guildId },
        {
          repeated: false,
          delay: config.lockdownDurationMinutes * Time.Minute,
          customJobOptions: {
            jobId: `filter-auto-lockdown-unlock-${message.guildId}`,
            removeOnComplete: true,
            removeOnFail: true,
          },
        },
      );
    } catch (err) {
      services.logger.error(
        `[Filter] Could not schedule auto-lockdown unlock for guild ${message.guildId}; skipping the lockdown rather than risk locking it indefinitely.`,
        err,
      );
      await filterService.releaseAutoLockdown(services, message.guildId);
      return;
    }

    const { modified } = await lockAllTextChannels(message.guild);

    await logHeat(services, 
      message,
      "Auto-Lockdown - Triggered",
      `Mention flood: ${total} mentions within ${config.lockdownWindowSeconds}s. Locked ${modified} channel(s) for ${config.lockdownDurationMinutes}m.`,
    );
  }

async function heatCheck(
  services: Container,
  message: GuildMessage,
  mentionCount: number,
  wasHit: boolean,
  config: HeatConfig,
  filterService: FilterUtility,
): Promise<void> {
    const { guildId } = message;
    const userId = message.author.id;
    const member = message.member;

    // Heat panic mode: a flagged raider's next message is actioned instantly,
    // without waiting for their (possibly already-cleared) heat to re-cross
    // the threshold.
    if (
      (await filterService.isHeatPanicActive(services, guildId)) &&
      (await filterService.isFlaggedRaider(services, guildId, userId))
    ) {
      if (member) {
        const reason =
          "Heat panic mode: flagged raider posted during the active raid window";
        await member
          .timeout(config.timeoutMinutes * Time.Minute, reason)
          .catch(swallow("Filter: heat panic timeout"));
        await logHeat(services, message, "Heat Panic - Timeout", reason);
      }
      return;
    }

    let points = config.perMessage;
    if (config.perMention > 0) points += config.perMention * mentionCount;
    if (wasHit) points += config.perFilterHit;
    if (config.perAttachment > 0 && message.attachments.size > 0) {
      points += config.perAttachment * message.attachments.size;
    }
    if (config.perEmoji > 0) {
      const emojiCount = countEmoji(message.content);
      if (emojiCount > 0) points += config.perEmoji * emojiCount;
    }
    if (config.perLink > 0 && containsLink(message.content)) {
      points += config.perLink;
    }
    if (config.perDuplicate > 0 || config.perSimilar > 0) {
      const { exact, similarity } = await filterService.checkDuplicate(services, 
        guildId,
        userId,
        message.content,
      );
      if (exact && config.perDuplicate > 0) {
        points += config.perDuplicate;
      } else if (
        !exact &&
        config.perSimilar > 0 &&
        similarity >= config.similarityThreshold
      ) {
        points += config.perSimilar;
      }
    }
    if (config.perZalgo > 0 && isZalgo(message.content)) {
      points += config.perZalgo;
    }
    if (points <= 0) return;

    // Wick treats webhook-relayed spam more harshly than a regular member.
    if (message.webhookId && config.webhookMultiplier > 1) {
      points *= config.webhookMultiplier;
    }

    const level = await filterService.addHeat(services, 
      guildId,
      userId,
      points,
      config,
    );
    const action = heatAction(level, config);
    if (action === "none") return;
    if (!(await filterService.claimEscalation(services, guildId, userId, action)))
      return;

    if (
      (action === "quarantine" || action === "timeout") &&
      member &&
      (await isImmuneToAutomatedAction(services, guildId, member))
    ) {
      return;
    }

    if (action === "quarantine" && member) {
      await filterService.clearHeat(services, guildId, userId);
      const reason = `Heat escalation: reached ${Math.round(level)} heat`;
      await QuarantineAction.apply({
        guild: message.guild,
        targetMember: member,
        moderator: services.client.user!,
        reason,
      }).catch(swallow("Filter: heat quarantine"));
      await logHeat(services, message, "Heat - Quarantine", reason);
    } else if (action === "timeout" && member) {
      await filterService.clearHeat(services, guildId, userId);
      const violations = await filterService.recordViolation(services, guildId, userId);
      const minutes = escalatedTimeoutMinutes(
        config.timeoutMinutes,
        violations,
        config,
      );
      const reason = `Heat escalation: reached ${Math.round(level)} heat (violation #${violations})`;
      await member
        .timeout(minutes * Time.Minute, reason)
        .catch(swallow("Filter: heat timeout"));
      await logHeat(services, message, "Heat - Timeout", reason);
    } else if (action === "warn") {
      const t = await fetchTyped(message, services);
      const warn = await message.channel
        .send(t("filter:heatWarn", { user: message.author.toString() }))
        .catch(swallow("Filter: heat warn"));
      if (warn) deleteMessageLater(warn, undefined, "Filter: delete heat warn");
    }

    if ((action === "quarantine" || action === "timeout") && config.panicRaiderCount > 0) {
      await filterService.recordHeatPanicRaider(services, guildId, userId, config);
    }
  }

async function logHeat(
  services: Container,
  message: GuildMessage,
  action: string,
  reason: string,
): Promise<void> {
  const logService = tryGetUtility("guild-log");
  await logService?.dispatch(services, {
    guildId: message.guildId,
    moduleName: "filter",
    action,
    targetId: message.author.id,
    actorId: services.client.user!.id,
    reason,
    color: Colors.Orange,
    extra: { Channel: channelMention(message.channelId) },
  });
}
