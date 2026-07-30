import { ApplyOptions } from "@sapphire/decorators";
import { getService, tryGetService } from "#lib/module-system/Service.js";
import { Colors, PermissionsBitField } from "discord.js";
import { channelMention } from "@discordjs/formatters";
import { cutText } from "@sapphire/utilities";
import { GuildMessageListener } from "#lib/module-system/GuildMessageListener.js";
import type { GuildMessage } from "#lib/types/common.js";
import type { FilterService } from "../services/FilterService.js";
import { getHitReason, type FilterHit } from "../lib/rules.js";
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

    const mentionCount =
      message.mentions.users.size + message.mentions.roles.size;
    const hit = this.filterService.test(
      message.guildId,
      message.content,
      mentionCount,
    );

    if (!hit) return;

    if (await this.#isExempt(message)) return;

    await message.delete().catch(swallow("Filter: delete filtered message"));

    await this.#warn(message, hit);

    await Promise.all([this.#punish(message, hit), this.#log(message, hit)]);
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
