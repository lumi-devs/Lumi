import { ApplyOptions } from "@sapphire/decorators";
import { getService, tryGetService } from "#lib/module-system/Service.js";
import { Colors, PermissionsBitField } from "discord.js";
import { channelMention } from "@discordjs/formatters";
import { cutText } from "@sapphire/utilities";
import { GuildMessageListener } from "#lib/module-system/GuildMessageListener.js";
import type { GuildMessage } from "#lib/types/common.js";
import type { FilterService } from "../services/FilterService.js";
import { getHitReason, type FilterHit } from "../lib/rules.js";
import { heatAction, type HeatConfig } from "../lib/heat.js";
import { QuarantineAction } from "#lib/moderation/QuarantineAction.js";
import { swallow } from "#lib/utilities/errors.js";
import { deleteMessageLater } from "#lib/utilities/temporary-message.js";
import { fetchTyped } from "#lib/commands.js";

@ApplyOptions<GuildMessageListener.Options>({ module: "filter" })
export class FilterMessageListener extends GuildMessageListener {
  private get filterService(): FilterService {
    return getService("filter");
  }

  protected async handle(message: GuildMessage): Promise<void> {
    const { member } = message;
    if (member?.permissions.has(PermissionsBitField.Flags.ManageMessages))
      return;

    if (!this.filterService.has(message.guildId)) {
      await this.filterService.loadGuild(message.guildId);
    }

    if (await this.#isExempt(message)) return;

    const mentionCount =
      message.mentions.users.size + message.mentions.roles.size;
    const hit = await this.filterService.test(
      message.guildId,
      message.content,
      mentionCount,
    );

    const heat = this.filterService.getHeat(message.guildId);
    const heatActive = heat?.enabled === true;
    if (!hit && !heatActive) return;

    if (hit) {
      await message.delete().catch(swallow("Filter: delete filtered message"));
      await this.#warn(message, hit);
      await Promise.all([this.#punish(message, hit), this.#log(message, hit)]);
    }

    if (heatActive) await this.#heat(message, mentionCount, hit !== null, heat);
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

    let points = config.perMessage;
    if (config.perMention > 0) points += config.perMention * mentionCount;
    if (wasHit) points += config.perFilterHit;
    if (
      config.perDuplicate > 0 &&
      (await this.filterService.isDuplicate(guildId, userId, message.content))
    ) {
      points += config.perDuplicate;
    }
    if (points <= 0) return;

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

    const reason = `Heat escalation: reached ${Math.round(level)} heat`;
    const member = message.member;
    if (action === "quarantine" && member) {
      await this.filterService.clearHeat(guildId, userId);
      await QuarantineAction.apply({
        guild: message.guild,
        targetMember: member,
        moderator: this.container.client.user!,
        reason,
      }).catch(swallow("Filter: heat quarantine"));
      await this.#logHeat(message, "Heat - Quarantine", reason);
    } else if (action === "timeout" && member) {
      await this.filterService.clearHeat(guildId, userId);
      await member
        .timeout(config.timeoutMinutes * 60_000, reason)
        .catch(swallow("Filter: heat timeout"));
      await this.#logHeat(message, "Heat - Timeout", reason);
    } else if (action === "warn") {
      const t = await fetchTyped(message);
      const warn = await message.channel
        .send(t("filter:heatWarn", { user: message.author.toString() }))
        .catch(swallow("Filter: heat warn"));
      if (warn) deleteMessageLater(warn, undefined, "Filter: delete heat warn");
    }
  }

  async #logHeat(
    message: GuildMessage,
    action: string,
    reason: string,
  ): Promise<void> {
    const logService = tryGetService("guild-log");
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

  async #isExempt(message: GuildMessage): Promise<boolean> {
    const exemptRoles = await getService("config").getConfigList(
      message.guildId,
      "filter",
      "exempt_roles",
    );
    if (exemptRoles.length === 0) return false;
    const roles = message.member?.roles.cache;
    return roles ? exemptRoles.some((id) => roles.has(id)) : false;
  }

  /** Transient warning with the configurable template; empty string disables. */
  async #warn(message: GuildMessage, hit: FilterHit): Promise<void> {
    const t = await fetchTyped(message);
    const template = await this.container.db.config.getModuleConfig(
      message.guildId,
      "filter",
      "warn_message",
    );
    const defaultTemplate = t("filter:defaultWarnMessage");
    const reasonText = getHitReason(t, hit.rule);
    const text = (
      typeof template === "string" ? template : defaultTemplate
    )
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
  async #punish(message: GuildMessage, hit: FilterHit): Promise<void> {
    const minutes = await this.container.db.config.getModuleConfig(
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

  async #log(message: GuildMessage, hit: FilterHit): Promise<void> {
    const logService = tryGetService("guild-log");
    await logService?.dispatch({
      guildId: message.guildId,
      moduleName: "filter",
      action: `Filter - ${hit.rule}`,
      targetId: message.author.id,
      actorId: this.container.client.user!.id,
      reason: hit.detail,
      color: Colors.Red,
      extra: {
        Channel: channelMention(message.channelId),
        Message: cutText(message.content, 200),
      },
    });
  }
}
