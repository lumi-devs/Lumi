import { isBotOwner } from "@lumi/permits";
import type { AutocompleteInteraction } from "discord.js";
import { hasAdminAccess, roleIdsFrom } from "../../access.js";
import type { HubServices } from "../../panel/services.js";
import { isValidNode, permitNodeCatalog } from "../../permits/nodes.js";

export async function autocompleteNode(
  interaction: AutocompleteInteraction,
  services: HubServices,
): Promise<void> {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== "nodes" && focused.name !== "node") {
    await interaction.respond([]);
    return;
  }
  if (interaction.guildId === null) {
    await interaction.respond([]);
    return;
  }

  const allowed = await hasAdminAccess({
    guildId: interaction.guildId,
    userId: interaction.user.id,
    roleIds: roleIdsFrom(interaction.member, interaction.guildId),
    guildOwnerId: interaction.guild?.ownerId,
    memberPermissions: interaction.memberPermissions,
    client: interaction.client,
    permits: services.permits,
  });
  if (!allowed) {
    await interaction.respond([]);
    return;
  }

  const nodes = (
    await permitNodeCatalog(
      services.permits,
      services.moduleLoader,
      interaction.guildId,
    )
  ).filter((node) => node !== "*" || isBotOwner(interaction.user.id));
  const raw = String(focused.value);
  const parts = raw.split(",");
  const query = (parts.pop() ?? "").trim();
  const completed = parts
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const prefix = completed.length > 0 ? `${completed.join(", ")}, ` : "";
  const lowered = query.toLowerCase();
  const matches = nodes.filter((node) => node.toLowerCase().includes(lowered));
  const choices = matches.slice(0, 25).map((node) => {
    const value = `${prefix}${node}`.slice(0, 100);
    return { name: value, value };
  });

  if (query.length > 0 && isValidNode(query) && !nodes.includes(query)) {
    const value = `${prefix}${query}`.slice(0, 100);
    choices.unshift({
      name: `${value} (custom)`.slice(0, 100),
      value,
    });
  }

  await interaction.respond(choices.slice(0, 25));
}
