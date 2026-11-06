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
  permitEnforcementEnabled,
  roleIdsFrom,
} from "../admin/access.js";
import { handleHubInteraction } from "../admin/panel/HubPanel.js";
import type { PermitPanel } from "../admin/panel/PermitPanel.js";
import { isGuildBlacklisted, isUserBlacklisted } from "./blacklist.js";
import type { BotServices } from "./contracts.js";
import { handlePingButton } from "./commands.js";
import type { ErrorStore } from "./errorStore.js";
import { commandErrorCard } from "./errors.js";
import { isModuleLocked } from "./locks.js";
import { type CommandRegistry, servicesForModule } from "./modules.js";
import { isBotOwner } from "./owner.js";

export type BotInteraction =
  ButtonInteraction | AnySelectMenuInteraction | ModalSubmitInteraction;

export interface DispatchContext {
  client: Client;
  registry: CommandRegistry;
  moduleLoader: ModuleLoader;
  services: BotServices;
  logger: { error(message: string, meta?: unknown): void };
  errorStore: ErrorStore;
  createPermitPanel(guildId: string, interaction: BotInteraction): PermitPanel;
}

async function handleAutocomplete(
  interaction: Interaction,
  context: DispatchContext,
): Promise<void> {
  if (!interaction.isAutocomplete()) return;
  const command = context.registry.get(interaction.commandName);
  if (!command) {
    await interaction.respond([]).catch(() => undefined);
    return;
  }
  if (command.ownerOnly && !isBotOwner(interaction.user.id)) {
    await interaction.respond([]).catch(() => undefined);
    return;
  }
  if (command.requiresAdmin) {
    const allowed =
      interaction.guildId !== null &&
      (await hasAdminAccess({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        roleIds: roleIdsFrom(interaction.member, interaction.guildId),
        guildOwnerId: interaction.guild?.ownerId,
        memberPermissions: interaction.memberPermissions,
        enforcePermits: await permitEnforcementEnabled(
          context.services.configService,
          interaction.guildId,
        ),
        client: context.client,
        permits: context.services.permits,
      }));
    if (!allowed) {
      await interaction.respond([]).catch(() => undefined);
      return;
    }
  }
  if (
    command.autocomplete &&
    (!command.module ||
      !interaction.guildId ||
      context.moduleLoader.isActive(interaction.guildId, command.module))
  ) {
    if (command.module === null) {
      await command.autocomplete(interaction, context.services);
    } else {
      await command.autocomplete(
        interaction,
        servicesForModule(context.services, command.module),
      );
    }
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
    enforcePermits: await permitEnforcementEnabled(
      context.services.configService,
      interaction.guildId,
    ),
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
      enforcePermits: await permitEnforcementEnabled(
        context.services.configService,
        interaction.guildId,
      ),
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
          ui.makeErrorCard(
            "Unknown Command",
            "That command is not registered.",
          ),
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
    if (
      await isModuleLocked(
        context.services.redis,
        interaction.guildId,
        command.module,
      )
    ) {
      await interaction
        .reply(
          ui.ephemeralCard(
            ui.makeErrorCard(
              "Temporarily Locked",
              `The **${command.module}** module is locked while panic mode is active.`,
            ),
          ),
        )
        .catch(() => undefined);
      return;
    }
  }

  if (command.ownerOnly && !isBotOwner(interaction.user.id)) {
    await interaction
      .reply(
        ui.ephemeralCard(
          ui.makeErrorCard(
            "Owner Only",
            "That command is restricted to bot owners.",
          ),
        ),
      )
      .catch(() => undefined);
    return;
  }

  if (
    (command.guildOnly || command.dmPermission === false) &&
    !interaction.guildId
  ) {
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

  const scope = `${interaction.guildId ?? "dm"}:${interaction.user.id}:${interaction.commandName}`;
  if (command.cooldownSeconds && command.cooldownSeconds > 0) {
    const hits = await context.services.helpers.cache.incr(
      `command-cooldown:${scope}`,
      command.cooldownSeconds * 1000,
    );
    if (hits > 1) {
      await interaction
        .reply(
          ui.ephemeralCard(
            ui.makeErrorCard(
              "Slow Down",
              `That command is on cooldown for ${command.cooldownSeconds}s.`,
            ),
          ),
        )
        .catch(() => undefined);
      return;
    }
  }

  const release =
    command.concurrency === undefined
      ? null
      : await context.services.helpers.cache.takeLock(
          `command-running:${scope}`,
          60_000,
        );
  if (command.concurrency !== undefined && !release) {
    await interaction
      .reply(
        ui.ephemeralCard(
          ui.makeErrorCard(
            "Already Running",
            "That command is already running for you.",
          ),
        ),
      )
      .catch(() => undefined);
    return;
  }

  try {
    if (command.module === null) {
      await command.execute(interaction, context.services);
    } else {
      await command.execute(
        interaction,
        servicesForModule(context.services, command.module),
      );
    }
    commandsExecuted.inc({
      command: interaction.commandName,
      module: command.module ?? "builtin",
      status: "ok",
    });
  } catch (error) {
    const record = await context.errorStore.record({
      error,
      source: "command",
      guildId: interaction.guildId ?? undefined,
      userId: interaction.user.id,
      command: interaction.commandName,
    });
    context.logger.error("Command failed", {
      command: interaction.commandName,
      guildId: interaction.guildId,
      traceId: record.id,
      error,
    });
    commandsExecuted.inc({
      command: interaction.commandName,
      module: command.module ?? "builtin",
      status: "error",
    });
    const card = commandErrorCard(error, record.id);
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(card).catch(() => undefined);
    } else {
      await interaction.reply(card).catch(() => undefined);
    }
  } finally {
    await release?.();
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

  if (
    interaction.isButton() &&
    (await handlePingButton(interaction, context.services))
  ) {
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
    if (!isBotOwner(interaction.user.id)) {
      const [userBlocked, guildBlocked] = await Promise.all([
        isUserBlacklisted(
          context.services.prisma,
          context.services.helpers.cache,
          interaction.user.id,
        ),
        isGuildBlacklisted(
          context.services.prisma,
          context.services.helpers.cache,
          interaction.guildId,
        ),
      ]);
      if (userBlocked || guildBlocked) {
        if (interaction.isAutocomplete()) {
          await interaction.respond([]).catch(() => undefined);
        } else if (interaction.isRepliable()) {
          await interaction
            .reply(
              ui.ephemeralCard(
                ui.makeErrorCard(
                  "Unavailable",
                  "You cannot use Lumi in this context.",
                ),
              ),
            )
            .catch(() => undefined);
        }
        return;
      }
    }

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
    const record = await context.errorStore.record({
      error,
      source: "interaction",
      guildId: interaction.guildId ?? undefined,
      userId: interaction.user.id,
    });
    context.logger.error("Unhandled interaction error", {
      type: interaction.type,
      customId: "customId" in interaction ? interaction.customId : undefined,
      traceId: record.id,
      error,
    });
    if (
      interaction.isRepliable() &&
      !interaction.replied &&
      !interaction.deferred
    ) {
      await interaction
        .reply(commandErrorCard(error, record.id))
        .catch(() => undefined);
    }
  }
}
