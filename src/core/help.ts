import type { CommandDefinition } from "@lumi/module-kit";
import type { ModuleLoader } from "@lumi/module-runtime";
import type { PermitRepository } from "@lumi/permits";
import * as ui from "@lumi/ui";
import type { ChatInputCommandInteraction, Client } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import {
  hasAdminAccess,
  hasPermitAccess,
  permitEnforcementEnabled,
  roleIdsFrom,
} from "../admin/access.js";
import type { ConfigService } from "../admin/services/ConfigService.js";
import type { CommandRegistry } from "./modules.js";
import { isBotOwner } from "./owner.js";

interface HelpOptions {
  registry: CommandRegistry;
  loader: Pick<ModuleLoader, "getModule" | "isActive">;
  permits: PermitRepository;
  configService: ConfigService;
  client: Client;
}

export function createHelpCommand(options: HelpOptions): CommandDefinition {
  const { registry, loader, permits, configService, client } = options;

  return {
    data: new SlashCommandBuilder()
      .setName("help")
      .setDescription("List commands available to you"),
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
      const guildId = interaction.guildId;
      const access = {
        guildId: guildId ?? "",
        userId: interaction.user.id,
        roleIds: roleIdsFrom(interaction.member, guildId ?? ""),
        channelId: interaction.channelId ?? undefined,
        guildOwnerId: interaction.guild?.ownerId,
        enforcePermits: guildId
          ? await permitEnforcementEnabled(configService, guildId)
          : false,
        client,
        permits,
      };

      const groups = new Map<string, string[]>();
      for (const command of registry.all()) {
        if (
          command.module &&
          (!guildId || !loader.isActive(guildId, command.module))
        ) {
          continue;
        }
        if (command.prefixOnly) continue;
        if (command.ownerOnly && !isBotOwner(interaction.user.id)) continue;
        if (
          command.requiresAdmin &&
          !(guildId && (await hasAdminAccess(access)))
        ) {
          continue;
        }
        if (
          command.requiredPermit &&
          !(guildId && (await hasPermitAccess(access, command.requiredPermit)))
        ) {
          continue;
        }

        const json = command.data.toJSON();
        const description =
          "description" in json && typeof json.description === "string"
            ? json.description
            : "";
        const label =
          (command.module &&
            loader.getModule(command.module)?.manifest.displayName) ||
          "Core";
        const lines = groups.get(label) ?? [];
        lines.push(`**/${json.name}** — ${description}`);
        groups.set(label, lines);
      }

      const body = ui.fitLines(
        [...groups]
          .sort(([left], [right]) => left.localeCompare(right))
          .flatMap(([label, lines]) => [`__${label}__`, ...lines]),
      );
      await interaction.reply(
        ui.ephemeralCard(
          ui.makeInfoCard("Commands", body || "No commands are available."),
        ),
      );
    },
  };
}
