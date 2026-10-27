import {
  SlashCommandBuilder,
  ButtonStyle,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";
import { isBotOwner, type Polarity } from "@lumi/permits";
import {
  buildSafeActionRows,
  createActionButton,
  ephemeralCard,
  makeErrorCard,
  makeSuccessCard,
  row,
} from "@lumi/ui";
import type { HubServices } from "../panel/HubPanel.js";
import { hasAdminAccess, roleIdsFrom } from "../access.js";
import {
  collectPermitNodes,
  formatPermitNodeLines,
  isValidNode,
  parseNodeList,
  suggestPermitName,
} from "../permits/nodes.js";
import {
  allExplanationCard,
  explanationCard,
} from "../permits/explain.js";
import { uniquePermitName } from "../permits/names.js";

function openPermitsRow() {
  return buildSafeActionRows([
    row(
      createActionButton({
        customId: "lumi:permitpanel",
        label: "Open Permits",
        style: ButtonStyle.Primary,
        emoji: "🛡️",
      }),
    ),
  ]);
}

async function autocompleteNode(
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

  const permits = await services.permits.listPermits(interaction.guildId);
  const nodes = collectPermitNodes(
    services.moduleLoader,
    permits.flatMap((permit) => permit.nodes),
  ).filter((node) => node !== "*" || isBotOwner(interaction.user.id));
  const raw = String(focused.value);
  const parts = raw.split(",");
  const query = (parts.pop() ?? "").trim();
  const completed = parts
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const prefix = completed.length > 0 ? `${completed.join(", ")}, ` : "";
  const lowered = query.toLowerCase();
  const matches = nodes.filter((node) =>
    node.toLowerCase().includes(lowered),
  );
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

async function createPermit(
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
  } catch (error: any) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Create Failed",
          `Could not create the permit: ${error.message}`,
        ),
      ),
    );
  }
}

async function explainPermit(
  interaction: ChatInputCommandInteraction,
  services: HubServices,
): Promise<void> {
  const guild = interaction.guild;
  if (guild === null) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard("Permit", "This command can only be used in a server."),
      ),
    );
    return;
  }

  const user = interaction.options.getUser("user", true);
  const node = interaction.options.getString("node")?.trim();
  if (node !== undefined && !isValidNode(node)) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Invalid Node",
          "Use a node such as `mod.ban`, `admin.*`, or `*`.",
        ),
      ),
    );
    return;
  }

  const channel = interaction.options.getChannel("channel");
  let channelId: string | undefined;
  if (channel !== null) channelId = channel.id;

  try {
    const member = await guild.members.fetch(user.id);
    const roleIds = member.roles.cache
      .filter((role) => role.id !== guild.id)
      .map((role) => role.id);

    if (node === undefined) {
      const permits = await services.permits.listPermits(guild.id);
      const nodes = collectPermitNodes(
        services.moduleLoader,
        permits.flatMap((permit) => permit.nodes),
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
  } catch (error: any) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Check Failed",
          `Could not evaluate the permit: ${error.message}`,
        ),
      ),
    );
  }
}

export const permitCommand = {
  requiresAdmin: true,
  data: new SlashCommandBuilder()
    .setName("permit")
    .setDescription("Create permits and explain permission checks")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Create a permit")
        .addStringOption((option) =>
          option
            .setName("nodes")
            .setDescription(
              "Permission nodes, comma-separated: mod.ban, admin.config",
            )
            .setRequired(true)
            .setMaxLength(1000)
            .setAutocomplete(true),
        )
        .addStringOption((option) =>
          option
            .setName("polarity")
            .setDescription("Grant or Deny")
            .setRequired(true)
            .addChoices(
              { name: "Grant", value: "Grant" },
              { name: "Deny", value: "Deny" },
            ),
        )
        .addIntegerOption((option) =>
          option
            .setName("position")
            .setDescription("Priority, lower numbers run first")
            .setMinValue(0)
            .setMaxValue(1000),
        )
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Optional display name")
            .setMaxLength(64),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("explain")
        .setDescription("Explain a member's permission check")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("Member to check")
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("node")
            .setDescription("Permission node to evaluate, or omit to check all")
            .setAutocomplete(true),
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Optional channel context"),
        ),
    ),
  async execute(
    interaction: ChatInputCommandInteraction,
    services: HubServices,
  ): Promise<void> {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "create") {
      await createPermit(interaction, services);
      return;
    }
    await explainPermit(interaction, services);
  },
  async autocomplete(
    interaction: AutocompleteInteraction,
    services: HubServices,
  ): Promise<void> {
    await autocompleteNode(interaction, services);
  },
};
