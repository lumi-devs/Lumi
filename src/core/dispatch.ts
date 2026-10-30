import type { ModuleLoader } from "@lumi/module-runtime";
import { commandsExecuted } from "@lumi/observability";
import * as ui from "@lumi/ui";
import type {
  AnySelectMenuInteraction,
  ButtonInteraction,
  Client,
  Interaction,
  ModalSubmitInteraction,
} from "discord.js";
import {
  hasAdminAccess,
  hasPermitAccess,
  roleIdsFrom,
} from "../admin/access.js";
import { handleHubInteraction } from "../admin/panel/HubPanel.js";
import type { PermitPanel } from "../admin/panel/PermitPanel.js";
import type { HubServices } from "../admin/panel/services.js";
import { handlePingButton } from "./commands.js";
import { commandErrorCard } from "./errors.js";
import { type CommandRegistry, servicesForModule } from "./modules.js";

export type BotInteraction =
  | ButtonInteraction
  | AnySelectMenuInteraction
  | ModalSubmitInteraction;

export interface DispatchServices extends HubServices {
  client: Client;
}

export interface DispatchContext {
  client: Client;
  registry: CommandRegistry;
  moduleLoader: ModuleLoader;
  services: DispatchServices;
  logger: { error(message: string, meta?: unknown): void };
  createPermitPanel(guildId: string, interaction: BotInteraction): PermitPanel;
}

async function handleAutocomplete(
  interaction: Interaction,
  context: DispatchContext,
): Promise<void> {
  if (!interaction.isAutocomplete()) return;
  const command = context.registry.get(interaction.commandName);
  if (
    command?.autocomplete &&
    (!command.module ||
      !interaction.guildId ||
      context.moduleLoader.isActive(interaction.guildId, command.module))
  ) {
    const services = command.module
      ? servicesForModule(context.services, command.module)
      : context.services;
    await command.autocomplete(interaction, services);
    return;
  }
  await interaction.respond([]).catch(() => undefined);
}

async function requireAdmin(
  interaction: Interaction,
  context: DispatchContext,
  message: string,
): Promise<boolean> {
  if (
    !interaction.isRepliable() ||
    !interaction.guildId ||
    !("member" in interaction)
  ) {
    return false;
  }
  const allowed = await hasAdminAccess({
    guildId: interaction.guildId,
    userId: interaction.user.id,
    roleIds: roleIdsFrom(interaction.member, interaction.guildId),
    guildOwnerId: interaction.guild?.ownerId,
    memberPermissions: interaction.memberPermissions,
    client: context.client,
    permits: context.services.permits,
  });
  if (!allowed) {
    await interaction
      .reply(ui.ephemeralCard(ui.makeErrorCard("Missing Permissions", message)))
      .catch(() => undefined);
  }
  return allowed;
}

async function requirePermit(
  interaction: Interaction,
  context: DispatchContext,
  permitNode: string,
): Promise<boolean> {
  if (!interaction.isRepliable()) return false;
  if (!interaction.guildId || !("member" in interaction)) {
    await interaction
      .reply(
        ui.ephemeralCard(
          ui.makeErrorCard(
            "Server Only",
            "That command can only be used in a server.",
          ),
        ),
      )
      .catch(() => undefined);
    return false;
  }

  const allowed = await hasPermitAccess(
    {
      guildId: interaction.guildId,
      userId: interaction.user.id,
      roleIds: roleIdsFrom(interaction.member, interaction.guildId),
      channelId: interaction.channelId ?? undefined,
      guildOwnerId: interaction.guild?.ownerId,
      client: context.client,
      permits: context.services.permits,
    },
    permitNode,
  );

  if (!allowed) {
    await interaction
      .reply(
        ui.ephemeralCard(
          ui.makeErrorCard(
            "Missing Permit",
            `You need the **${permitNode}** permit on this server.`,
          ),
        ),
      )
      .catch(() => undefined);
  }
  return allowed;
}

async function handleChatInput(
  interaction: Interaction,
  context: DispatchContext,
): Promise<void> {
  if (!interaction.isChatInputCommand()) return;
  const command = context.registry.get(interaction.commandName);
  if (!command) {
    await interaction
      .reply(
        ui.ephemeralCard(
          ui.makeErrorCard("Unknown Command", "That command is not registered."),
        ),
      )
      .catch(() => undefined);
    return;
  }

  if (command.module && interaction.guildId) {
    const enabled = context.moduleLoader.isActive(
      interaction.guildId,
      command.module,
    );
    if (!enabled) {
      await interaction
        .reply(
          ui.ephemeralCard(
            ui.makeErrorCard(
              "Module Disabled",
              `The **${command.module}** module is disabled on this server. Open \`/lumi\` to enable it.`,
            ),
          ),
        )
        .catch(() => undefined);
      return;
    }
  }

  if (command.requiresAdmin) {
    if (!interaction.guildId) {
      await interaction
        .reply(
          ui.ephemeralCard(
            ui.makeErrorCard(
              "Server Only",
              "That command can only be used in a server.",
            ),
          ),
        )
        .catch(() => undefined);
      return;
    }
    const allowed = await requireAdmin(
      interaction,
      context,
      "You need **Manage Server** or an admin permit to use that command.",
    );
    if (!allowed) return;
  }

  if (
    command.requiredPermit &&
    !(await requirePermit(interaction, context, command.requiredPermit))
  ) {
    return;
  }

  const services = command.module
    ? servicesForModule(context.services, command.module)
    : context.services;

  try {
    await command.execute(interaction, services);
    commandsExecuted.inc({
      command: interaction.commandName,
      module: command.module ?? "builtin",
      status: "ok",
    });
  } catch (error) {
    context.logger.error("Command failed", {
      command: interaction.commandName,
      guildId: interaction.guildId,
      error,
    });
    commandsExecuted.inc({
      command: interaction.commandName,
      module: command.module ?? "builtin",
      status: "error",
    });
    const card = commandErrorCard(error);
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(card).catch(() => undefined);
    } else {
      await interaction.reply(card).catch(() => undefined);
    }
  }
}

async function handleComponent(
  interaction: Interaction,
  context: DispatchContext,
): Promise<void> {
  if (
    !interaction.isButton() &&
    !interaction.isAnySelectMenu() &&
    !interaction.isModalSubmit()
  ) {
    return;
  }

  if (interaction.isButton() && (await handlePingButton(interaction, context.services))) {
    return;
  }
  if (await handleHubInteraction(interaction, context.services)) return;
  if (!interaction.customId.startsWith("permit_")) return;

  const guildId = interaction.guildId;
  if (!guildId) return;
  const allowed = await requireAdmin(
    interaction,
    context,
    "You need **Manage Server** or an admin permit to manage permits.",
  );
  if (!allowed) return;

  const panel = context.createPermitPanel(guildId, interaction);
  if (interaction.isModalSubmit()) {
    await panel.handleModalSubmit(interaction);
  } else if (interaction.isButton()) {
    await panel.handleInteraction(interaction);
  } else {
    await panel.handleSelectMenu(interaction);
  }
}

export async function handleInteraction(
  interaction: Interaction,
  context: DispatchContext,
): Promise<void> {
  try {
    if (interaction.isAutocomplete()) {
      await handleAutocomplete(interaction, context);
      return;
    }
    if (interaction.isChatInputCommand()) {
      await handleChatInput(interaction, context);
      return;
    }
    await handleComponent(interaction, context);
  } catch (error) {
    context.logger.error("Unhandled interaction error", {
      type: interaction.type,
      customId: "customId" in interaction ? interaction.customId : undefined,
      error,
    });
    if (
      interaction.isRepliable() &&
      !interaction.replied &&
      !interaction.deferred
    ) {
      await interaction.reply(commandErrorCard(error)).catch(() => undefined);
    }
  }
}
