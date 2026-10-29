import type { Prisma } from "@lumi/db";
import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { ephemeralCard, makeErrorCard, makeSuccessCard } from "@lumi/ui";
import { isBotOwner } from "@lumi/permits";
import { errorMessage } from "../../../core/errors.js";
import { cut } from "../common.js";
import { isValidNode, parseNodeList } from "../../permits/nodes.js";
import type { PermitHost } from "./host.js";

export async function showEditModal(
  host: PermitHost,
  permitId: number,
): Promise<void> {
  const interaction = host.interaction;
  if (!interaction.isButton()) return;

  const permit = await host.permitRepo.getPermit(host.guildId, permitId);
  if (!permit) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard("Permit Not Found", "That permit no longer exists."),
      ),
    );
    return;
  }
  if (!host.canManageExtraOwnerPermit(permit)) {
    await interaction.reply(ephemeralCard(host.extraOwnerError()));
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`permit_edit_modal:${permitId}`)
    .setTitle(`Edit Permit: ${cut(permit.name, 30)}`);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("name")
        .setLabel("Permit Name")
        .setStyle(TextInputStyle.Short)
        .setValue(permit.name)
        .setRequired(true)
        .setMaxLength(64),
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("nodes")
        .setLabel("Permission Nodes (comma-separated)")
        .setStyle(TextInputStyle.Paragraph)
        .setValue(permit.nodes.join(", "))
        .setRequired(true)
        .setMaxLength(1000),
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("polarity")
        .setLabel("Polarity (Grant/Deny)")
        .setStyle(TextInputStyle.Short)
        .setValue(permit.polarity)
        .setRequired(true)
        .setMaxLength(5),
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("schedule")
        .setLabel("Cron Schedule (optional)")
        .setStyle(TextInputStyle.Short)
        .setValue(typeof permit.schedule === "string" ? permit.schedule : "")
        .setRequired(false),
    ),
  );

  await interaction.showModal(modal);
}

export async function handleEditSubmit(
  host: PermitHost,
  permitId: number,
): Promise<void> {
  const interaction = host.interaction;
  if (!interaction.isModalSubmit()) return;

  const permit = await host.permitRepo.getPermit(host.guildId, permitId);
  if (!permit) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard("Permit Not Found", "That permit no longer exists."),
      ),
    );
    return;
  }

  if (permit.builtin) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard("Built-in Permit", "Built-in permits cannot be edited."),
      ),
    );
    return;
  }

  if (!host.canManageExtraOwnerPermit(permit)) {
    await interaction.reply(ephemeralCard(host.extraOwnerError()));
    return;
  }

  const name = interaction.fields.getTextInputValue("name").trim();
  const nodes = parseNodeList(interaction.fields.getTextInputValue("nodes").trim());
  const rawPolarity = interaction.fields.getTextInputValue("polarity").trim();
  const schedule = interaction.fields.getTextInputValue("schedule").trim() || null;

  if (!name || nodes.length === 0) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Missing Fields",
          "Permit name and at least one permission node are required.",
        ),
      ),
    );
    return;
  }

  if (nodes.includes("*") && !isBotOwner(interaction.user.id)) {
    await interaction.reply(ephemeralCard(host.extraOwnerError()));
    return;
  }

  const invalidNode = nodes.find((node) => !isValidNode(node));
  if (invalidNode !== undefined) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Invalid Node",
          `\`${invalidNode}\` is not a valid permission node.`,
        ),
      ),
    );
    return;
  }

  if (rawPolarity !== "Grant" && rawPolarity !== "Deny") {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard("Invalid Polarity", "Polarity must be either `Grant` or `Deny`."),
      ),
    );
    return;
  }

  try {
    await host.permitRepo.updatePermit(permitId, {
      name,
      nodes,
      polarity: rawPolarity,
      // The JSON-null sentinel is a runtime value in packages/db's Prisma
      // install; keep the established null write until @lumi/permits accepts
      // a plain null.
      schedule: schedule as unknown as Prisma.PermitUpdateInput["schedule"],
    });

    await interaction.update(await host.detailCard(permitId));
    await interaction.followUp(
      ephemeralCard(
        makeSuccessCard("Permit Updated", `Saved changes to **${name}**.`, {
          footer: `Permit #${permit.number}`,
        }),
      ),
    );
  } catch (error: unknown) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Update Failed",
          `Could not update the permit: ${errorMessage(error)}`,
        ),
      ),
    );
  }
}
