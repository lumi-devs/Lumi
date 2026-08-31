import { ApplyOptions } from "@sapphire/decorators";
import { getUtility, tryGetUtility } from "#lib/module-system/Utility.js";
import { Colors } from "discord.js";
import { channelMention } from "@discordjs/formatters";
import { GuildMessageListener } from "#lib/module-system/GuildMessageListener.js";
import type { GuildMessage } from "#lib/types/common.js";
import type { FilterUtility } from "../utilities/FilterUtility.js";
import { enforceHit, runRules, shouldScreen } from "../lib/enforce.js";
import {
  containsLink,
  countEmoji,
  escalatedTimeoutMinutes,
  heatAction,
  type HeatConfig,
} from "../lib/heat.js";
import { QuarantineAction } from "#lib/moderation/QuarantineAction.js";
import { lockAllTextChannels } from "#lib/moderation/lockdown.js";
import { scheduleTask } from "#lib/schedule-task.js";
import { swallow } from "#lib/utilities/errors.js";
import { deleteMessageLater } from "#lib/utilities/temporary-message.js";
import { fetchTyped } from "#lib/commands.js";

@ApplyOptions<GuildMessageListener.Options>({ module: "filter" })
export class FilterMessageListener extends GuildMessageListener {
  private get filterService(): FilterUtility {
    return getUtility("filter");
  }

  protected async handle(message: GuildMessage): Promise<void> {
    if (!(await shouldScreen(message, this.filterService))) return;

    const mentionCount =
      message.mentions.users.size + message.mentions.roles.size;

    await this.#mentionFlood(message, mentionCount);

    const hit = await runRules(message, this.filterService, mentionCount);

    const heat = this.filterService.getHeat(message.guildId);
    const heatActive = heat?.enabled === true;
    if (!hit && !heatActive) return;

    if (hit) await enforceHit(message, hit);

    if (heatActive) await this.#heat(message, mentionCount, hit !== null, heat);
  }

  /**
   * Server-wide flood guard, independent of the Heat System: once non-exempt
   * mentions in the guild cross `lockdownMentionThreshold` within the window,
   * every text channel is locked for `lockdownDurationMinutes` and an
   * auto-unlock job is scheduled so the lock lifts even across a restart.
   */
  async #mentionFlood(message: GuildMessage, mentionCount: number): Promise<void> {
    if (mentionCount <= 0) return;
    const config = this.filterService.getHeat(message.guildId);
    if (!config || config.lockdownMentionThreshold <= 0) return;

    const total = await this.filterService.recordMentions(
      message.guildId,
      mentionCount,
      config.lockdownWindowSeconds,
    );
    if (total < config.lockdownMentionThreshold) return;

    const activated = await this.filterService.activateAutoLockdown(
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
          delay: config.lockdownDurationMinutes * 60_000,
          customJobOptions: {
            jobId: `filter-auto-lockdown-unlock:${message.guildId}`,
            removeOnComplete: true,
            removeOnFail: true,
          },
        },
      );
    } catch (err) {
      this.container.logger.error(
        `[Filter] Could not schedule auto-lockdown unlock for guild ${message.guildId}; skipping the lockdown rather than risk locking it indefinitely.`,
        err,
      );
      await this.filterService.releaseAutoLockdown(message.guildId);
      return;
    }

    const { modified } = await lockAllTextChannels(message.guild);

    await this.#logHeat(
      message,
      "Auto-Lockdown - Triggered",
      `Mention flood: ${total} mentions within ${config.lockdownWindowSeconds}s. Locked ${modified} channel(s) for ${config.lockdownDurationMinutes}m.`,
    );
  }

  /** Accrues heat from this message's signals and escalates once thresholds trip. */
  async #heat(
    message: GuildMessage,
    mentionCount: number,
    wasHit: boolean,
    config: HeatConfig,
  ): Promise<void> {
    const { guildId } = message;
    const userId = message.author.id;
    const member = message.member;

    // Heat panic mode: a flagged raider's next message is actioned instantly,
    // without waiting for their (possibly already-cleared) heat to re-cross
    // the threshold.
    if (
      (await this.filterService.isHeatPanicActive(guildId)) &&
      (await this.filterService.isFlaggedRaider(guildId, userId))
    ) {
      if (member) {
        const reason =
          "Heat panic mode: flagged raider posted during the active raid window";
        await member
          .timeout(config.timeoutMinutes * 60_000, reason)
          .catch(swallow("Filter: heat panic timeout"));
        await this.#logHeat(message, "Heat Panic - Timeout", reason);
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
    if (
      config.perDuplicate > 0 &&
      (await this.filterService.isDuplicate(guildId, userId, message.content))
    ) {
      points += config.perDuplicate;
    }
    if (points <= 0) return;

    // Wick treats webhook-relayed spam more harshly than a regular member.
    if (message.webhookId && config.webhookMultiplier > 1) {
      points *= config.webhookMultiplier;
    }

    const level = await this.filterService.addHeat(
      guildId,
      userId,
      points,
      config,
    );
    const action = heatAction(level, config);
    if (action === "none") return;
    if (!(await this.filterService.claimEscalation(guildId, userId, action)))
      return;

    if (action === "quarantine" && member) {
      await this.filterService.clearHeat(guildId, userId);
      const reason = `Heat escalation: reached ${Math.round(level)} heat`;
      await QuarantineAction.apply({
        guild: message.guild,
        targetMember: member,
        moderator: this.container.client.user!,
        reason,
      }).catch(swallow("Filter: heat quarantine"));
      await this.#logHeat(message, "Heat - Quarantine", reason);
    } else if (action === "timeout" && member) {
      await this.filterService.clearHeat(guildId, userId);
      const violations = await this.filterService.recordViolation(guildId, userId);
      const minutes = escalatedTimeoutMinutes(
        config.timeoutMinutes,
        violations,
        config,
      );
      const reason = `Heat escalation: reached ${Math.round(level)} heat (violation #${violations})`;
      await member
        .timeout(minutes * 60_000, reason)
        .catch(swallow("Filter: heat timeout"));
      await this.#logHeat(message, "Heat - Timeout", reason);
    } else if (action === "warn") {
      const t = await fetchTyped(message);
      const warn = await message.channel
        .send(t("filter:heatWarn", { user: message.author.toString() }))
        .catch(swallow("Filter: heat warn"));
      if (warn) deleteMessageLater(warn, undefined, "Filter: delete heat warn");
    }

    if ((action === "quarantine" || action === "timeout") && config.panicRaiderCount > 0) {
      await this.filterService.recordHeatPanicRaider(guildId, userId, config);
    }
  }

  async #logHeat(
    message: GuildMessage,
    action: string,
    reason: string,
  ): Promise<void> {
    const logService = tryGetUtility("guild-log");
    await logService?.dispatch({
      guildId: message.guildId,
      moduleName: "filter",
      action,
      targetId: message.author.id,
      actorId: this.container.client.user!.id,
      reason,
      color: Colors.Orange,
      extra: { Channel: channelMention(message.channelId) },
    });
  }
}
