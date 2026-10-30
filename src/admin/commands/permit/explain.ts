import { ephemeralCard } from "@lumi/ui";
import type { ChatInputCommandInteraction } from "discord.js";
import { errorMessage } from "../../../core/errors.js";
import { roleIdsFrom } from "../../access.js";
import type { HubServices } from "../../panel/services.js";
import { allExplanationCard, explanationCard } from "../../permits/explain.js";
import { isValidNode, permitNodeCatalog } from "../../permits/nodes.js";
import { openPermitsRow, replyPermitError } from "./shared.js";

export async function explainPermit(
  interaction: ChatInputCommandInteraction,
  services: HubServices,
): Promise<void> {
  const guild = interaction.guild;
  if (guild === null) {
    await replyPermitError(
      interaction,
      "Permit",
      "This command can only be used in a server.",
    );
    return;
  }

  const user = interaction.options.getUser("user", true);
  const node = interaction.options.getString("node")?.trim();
  if (node !== undefined && !isValidNode(node)) {
    await replyPermitError(
      interaction,
      "Invalid Node",
      "Use a node such as `mod.ban`, `admin.*`, or `*`.",
    );
    return;
  }

  const channel = interaction.options.getChannel("channel");
  const channelId = channel?.id;

  try {
    const member = await guild.members.fetch(user.id);
    const roleIds = roleIdsFrom(member, guild.id);

    if (node === undefined) {
      const nodes = await permitNodeCatalog(
        services.permits,
        services.moduleLoader,
        guild.id,
      );
      const results = await services.permits.explainPermitNodes(
        {
          guildId: guild.id,
          userId: user.id,
          roleIds,
          channelId,
          guildOwnerId: guild.ownerId,
        },
        nodes,
        interaction.client,
      );
      await interaction.reply(
        ephemeralCard(
          allExplanationCard(results, {
            userId: user.id,
            actionRows: openPermitsRow(),
          }),
        ),
      );
      return;
    }

    const result = await services.permits.explainPermit(
      {
        guildId: guild.id,
        userId: user.id,
        roleIds,
        channelId,
        guildOwnerId: guild.ownerId,
        permitNode: node,
      },
      interaction.client,
    );
    await interaction.reply(
      ephemeralCard(
        explanationCard(result, {
          userId: user.id,
          node,
          channelId,
          actionRows: openPermitsRow(),
        }),
      ),
    );
  } catch (error: unknown) {
    await replyPermitError(
      interaction,
      "Check Failed",
      `Could not evaluate the permit: ${errorMessage(error)}`,
    );
  }
}
