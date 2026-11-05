import type { ModuleServices } from "@lumi/module-kit";
import {
  ephemeralCard,
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
} from "@lumi/ui";
import {
  AttachmentBuilder,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildBasedChannel,
} from "discord.js";
import { getCustomCommandsConfig } from "../config.js";
import { executeCustomCommand, notifyProblem } from "../engine.js";
import { getCommandByName, invalidateGuild } from "../store.js";
import { buildExport, importCommands } from "../transfer.js";
import { splitArgs } from "../trigger.js";
import { Limits, type TriggerType } from "../types.js";
import { guildMember } from "./shared.js";

export async function runCustomCommand(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  guild: Guild,
): Promise<void> {
  const name = interaction.options.getString("name", true);
  const command = await getCommandByName(
    services,
    guild.id,
    name.trim().toLowerCase(),
  );
  if (!command) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Unknown Command",
          `No custom command named **${name}** exists.`,
        ),
      ),
    );
    return;
  }

  const config = await getCustomCommandsConfig(services, guild.id);
  const member = await guildMember(interaction, guild);
  const result = await executeCustomCommand(
    services,
    command,
    {
      guild,
      actor: interaction.user,
      member,
      channel: interaction.channel as GuildBasedChannel | null,
      args: splitArgs(interaction.options.getString("args") ?? ""),
      trigger: {
        type: command.triggerType as TriggerType,
        value: command.trigger,
      },
      reply: { kind: "interaction", interaction },
    },
    config,
  );

  if (result.status === "forbidden") {
    await notifyProblem(
      { kind: "interaction", interaction },
      "Not Permitted",
      `You do not have any permission node required by **${command.name}**.`,
      "🚫",
    );
  } else if (result.status === "cooldown") {
    await notifyProblem(
      { kind: "interaction", interaction },
      "Cooldown",
      `**${command.name}** is on cooldown for another ${result.remaining}s.`,
      "⏳",
    );
  } else if (result.status === "error") {
    await notifyProblem(
      { kind: "interaction", interaction },
      "Custom Command Failed",
      result.message,
      "⚠️",
    );
  }
}

export async function exportCommands(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  guild: Guild,
): Promise<void> {
  const name = interaction.options.getString("name");
  const data = await buildExport(services, guild.id, name ?? undefined);
  const json = JSON.stringify(data, null, 2);
  const buffer = Buffer.from(json, "utf8");
  const suffix = name
    ? name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
    : guild.id;
  const card = makeInfoCard("Custom Commands Export", [
    `**Groups**\n${data.groups.length}`,
    `**Commands**\n${data.commands.length}`,
    "The JSON file contains command definitions only. No tokens or secrets are included.",
  ]);
  await interaction.reply({
    ...ephemeralCard(card),
    files: [
      new AttachmentBuilder(buffer, { name: `custom-commands-${suffix}.json` }),
    ],
  });
}

export async function importFromInteraction(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
  guild: Guild,
): Promise<void> {
  const inline = interaction.options.getString("data");
  const attachment = interaction.options.getAttachment("file");
  if (inline && attachment) {
    throw new Error("Provide either inline data or a file, not both.");
  }
  if (!inline && !attachment) {
    throw new Error("Provide inline JSON data or attach a JSON file.");
  }

  let json = inline ?? "";
  if (attachment) {
    if (attachment.size > Limits.importBytes) {
      throw new Error(
        `Import files are limited to ${Limits.importBytes} bytes.`,
      );
    }
    const response = await fetch(attachment.url);
    if (!response.ok) {
      throw new Error(
        `Could not download the import file (${response.status}).`,
      );
    }
    json = await response.text();
  }

  const overwrite = interaction.options.getBoolean("overwrite") ?? false;
  const result = await importCommands(services, guild.id, json, {
    overwrite,
    userId: interaction.user.id,
  });
  invalidateGuild(guild.id);
  await interaction.reply(
    ephemeralCard(
      makeSuccessCard("Import Complete", [
        `**Groups created**\n${result.groups}`,
        `**Commands created**\n${result.commands}`,
        `**Overwrite**\n${overwrite ? "Enabled" : "Disabled"}`,
      ]),
    ),
  );
}
