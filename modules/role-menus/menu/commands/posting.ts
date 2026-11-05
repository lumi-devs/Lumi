import type { ModuleServices } from "@lumi/module-kit";
import {
  ephemeralCard,
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
} from "@lumi/ui";
import type { ChatInputCommandInteraction } from "discord.js";
import type { RoleMenusConfig } from "../config.js";
import {
  missingChannelCard,
  postRoleMenu,
  postSuccessCard,
  refreshRoleMenuMessage,
} from "../posting.js";
import type { GroupRecord } from "../service.js";
import { type RoleMenuStyle, roleMenuListCard } from "../ui.js";
import { groupSummary } from "./shared.js";

export async function postGroup(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  group: GroupRecord,
  config: RoleMenusConfig,
): Promise<void> {
  const style = (interaction.options.getString("style") ??
    "buttons") as RoleMenuStyle;
  const requestedChannel = interaction.options.getChannel("channel");
  const channelRef = requestedChannel ?? interaction.channel;
  const channel = channelRef
    ? (interaction.guild!.channels.cache.get(channelRef.id) ??
      (await interaction
        .guild!.channels.fetch(channelRef.id)
        .catch(() => null)))
    : null;
  if (!channel?.isSendable()) {
    await interaction.reply(ephemeralCard(missingChannelCard()));
    return;
  }
  if (group.options.length > config.maxOptionsPerGroup) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Too Many Options",
          `This group has ${group.options.length} options, above the server limit of ${config.maxOptionsPerGroup}.`,
        ),
      ),
    );
    return;
  }

  const result = await postRoleMenu(
    services,
    interaction.guild!,
    group,
    group.options,
    style,
    channel,
  );
  if ("error" in result) {
    await interaction.reply(
      ephemeralCard(makeErrorCard("Post Failed", result.error)),
    );
    return;
  }

  await interaction.reply(
    ephemeralCard(
      postSuccessCard(
        group,
        style,
        result.channelId,
        result.messageId,
        group.guildId,
      ),
    ),
  );
}

export async function refreshGroup(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  group: GroupRecord,
): Promise<void> {
  const messages = await services.helpers.roleMenus.listGroupMessages(group.id);
  if (messages.length === 0) {
    await interaction.reply(
      ephemeralCard(
        makeInfoCard(
          `🎭 ${group.name}`,
          "This group has no posted menus to refresh.",
        ),
      ),
    );
    return;
  }

  let refreshed = 0;
  let deleted = 0;
  let skipped = 0;
  for (const message of messages) {
    const outcome = await refreshRoleMenuMessage(
      services,
      interaction.guild!,
      group,
      group.options,
      message,
    );
    if (outcome === "refreshed") refreshed += 1;
    else if (outcome === "deleted") deleted += 1;
    else skipped += 1;
  }

  await interaction.reply(
    ephemeralCard(
      makeSuccessCard(`🎭 ${group.name}`, [
        `**Refreshed** ${refreshed}`,
        `**Deleted missing** ${deleted}`,
        `**Skipped** ${skipped}`,
      ]),
    ),
  );
}

export async function listGroups(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
): Promise<void> {
  const groups = await services.helpers.roleMenus.listGroups(
    interaction.guildId!,
  );

  if (groups.length === 0) {
    await interaction.reply(
      ephemeralCard(
        makeInfoCard(
          "🎭 Role Menus",
          "No role menus exist yet. Create one with `/rolemenu create`.",
        ),
      ),
    );
    return;
  }

  const lines = groups.map((group) => groupSummary(group));
  await interaction.reply(ephemeralCard(roleMenuListCard(lines)));
}
