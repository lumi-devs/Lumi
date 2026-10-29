import { isBotOwner, type Polarity } from "@lumi/permits";
import {
  ephemeralCard,
  makeErrorCard,
  makeSuccessCard,
} from "@lumi/ui";
import type { ChatInputCommandInteraction } from "discord.js";
import type { HubServices } from "../../panel/services.js";
import { errorMessage } from "../../../core/errors.js";
import {
  formatPermitNodeLines,
  isValidNode,
  parseNodeList,
  suggestPermitName,
} from "../../permits/nodes.js";
import { uniquePermitName } from "../../permits/names.js";
import { openPermitsRow } from "./shared.js";

export async function createPermit(
  interaction: ChatInputCommandInteraction,
  services: HubServices,
): Promise<void> {
  const guildId = interaction.guildId;
  if (guildId === null) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard("Permit", "This command can only be used in a server."),
      ),
    );
    return;
  }

  const nodes = parseNodeList(
    interaction.options.getString("nodes", true),
  );
  const invalidNode = nodes.find((node) => !isValidNode(node));
  if (invalidNode !== undefined || nodes.length === 0) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Invalid Node",
          invalidNode
            ? `\`${invalidNode}\` is not a valid permission node.`
            : "Use at least one node such as `mod.ban`, `admin.*`, or `*`.",
        ),
      ),
    );
    return;
  }

  if (nodes.includes("*") && !isBotOwner(interaction.user.id)) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Extra Owner",
          "Only bot owners can create a permit with `*`.",
        ),
      ),
    );
    return;
  }

  const polarityValue = interaction.options.getString("polarity", true);
  if (polarityValue !== "Grant" && polarityValue !== "Deny") {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Invalid Polarity",
          "Polarity must be either `Grant` or `Deny`.",
        ),
      ),
    );
    return;
  }
  const polarity: Polarity = polarityValue;
  const requestedName = interaction.options.getString("name")?.trim();
  const permits = await services.permits.listPermits(guildId);
  const existingNames = new Set(permits.map((permit) => permit.name));
  if (requestedName && existingNames.has(requestedName)) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Name Taken",
          `A permit named **${requestedName}** already exists.`,
        ),
      ),
    );
    return;
  }
  const position =
    interaction.options.getInteger("position") ??
    permits.reduce(
      (next, permit) => Math.max(next, permit.position + 1),
      0,
    );
  const name =
    requestedName ??
    uniquePermitName(existingNames, suggestPermitName(nodes, polarity));

  try {
    const permit = await services.permits.createPermit({
      guildId,
      name,
      nodes,
      polarity,
      position,
    });
    await interaction.reply(
      ephemeralCard(
        makeSuccessCard(
          "Permit Created",
          [
            `**Permit** #${permit.number}`,
            `**Name** ${permit.name}`,
            `**Nodes**\n${formatPermitNodeLines(permit.nodes)}`,
            `**Polarity** ${permit.polarity}`,
            `**Priority** ${permit.position}`,
          ],
          {
            breadcrumbs: ["Admin", "Permits", "Create"],
            footer: `Permit #${permit.number}`,
            actionRows: openPermitsRow(),
          },
        ),
      ),
    );
  } catch (error: unknown) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Create Failed",
          `Could not create the permit: ${errorMessage(error)}`,
        ),
      ),
    );
  }
}
