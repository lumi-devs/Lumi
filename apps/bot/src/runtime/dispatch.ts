import {
  Events,
  MessageFlags,
  SlashCommandBuilder,
  type Client,
  type Interaction,
  type Message,
  type SharedSlashCommand,
} from "discord.js";
import type { CommandContext, CommandDef, LumiServices } from "@lumi/module-kit";
import { hasPermit, isBotOwner } from "@lumi/module-kit";
import { claim } from "@lumi/redis";
import { ephemeralCard, makeErrorCard } from "@lumi/ui";
import { handleHelpInteraction } from "../commands/help.ts";
import { handlePingInteraction } from "../commands/ping.ts";
import { handleAfkInteraction } from "@modules/afk/interactions.ts";
import { handleSecurityInteraction } from "@modules/security/interactions.ts";
import { handleUtilityInteraction } from "@modules/utility/interactions.ts";
import { handleHubInteraction } from "../lumi/panel.ts";
import { CommandContextImpl } from "./context.ts";

export type Dispatcher = {
  readonly onInteraction: (interaction: Interaction) => Promise<void>;
  readonly onMessage: (message: Message) => Promise<void>;
};

export function createDispatcher(services: LumiServices, builtins: readonly CommandDef[]): Dispatcher {
  const find = (name: string): CommandDef | undefined =>
    builtins.find((command) => command.name === name) ?? services.modules.command(name);

  const handleInteraction = async (interaction: Interaction): Promise<void> => {
    try {
      if (interaction.isMessageComponent() || interaction.isModalSubmit()) {
        if (interaction.customId.startsWith("lumi:")) {
          await handleHubInteraction(services, interaction);
          return;
        }
        if (interaction.customId.startsWith("help:")) {
          if (interaction.isButton() || interaction.isStringSelectMenu()) {
            await handleHelpInteraction(services, builtins, interaction);
          }
          return;
        }
        if (interaction.isButton()) {
          if (interaction.customId.startsWith("ping:")) {
            await handlePingInteraction(services, interaction);
            return;
          }
          if (interaction.customId.startsWith("afk:")) {
            await handleAfkInteraction(services, interaction);
            return;
          }
          if (interaction.customId.startsWith("user-media:")) {
            await handleUtilityInteraction(services, interaction);
            return;
          }
          if (interaction.customId.startsWith("sec:")) {
            await handleSecurityInteraction(services, interaction);
            return;
          }
        }
      }
      if (!interaction.isChatInputCommand()) return;
      const command = find(interaction.commandName);
      if (!command) {
        await interaction.reply({ content: "Unknown command.", flags: MessageFlags.Ephemeral }).catch(() => undefined);
        return;
      }
      const context = new CommandContextImpl(services, command, interaction);
      await execute(services, command, context);
    } catch (error) {
      services.logger.error({ error }, "interaction dispatch failed");
    }
  };

  const handleMessage = async (message: Message): Promise<void> => {
    try {
      if (!message.inGuild() || message.author.bot || message.system) return;
      const prefix = await guildPrefix(services, message.guildId);
      if (!prefix || !message.content.startsWith(prefix)) return;
      const [name, ...args] = message.content.slice(prefix.length).trim().split(/\s+/);
      if (!name) return;
      const command = find(name);
      if (!command?.prefix) return;
      const context = new CommandContextImpl(services, command, message, args);
      await execute(services, command, context);
    } catch (error) {
      services.logger.error({ error, guildId: message.guildId }, "message dispatch failed");
    }
  };

  return { onInteraction: handleInteraction, onMessage: handleMessage };
}

export function wireDispatcher(client: Client, dispatcher: Dispatcher): void {
  client.on(Events.InteractionCreate, (interaction) => {
    void dispatcher.onInteraction(interaction);
  });
  client.on(Events.MessageCreate, (message) => {
    void dispatcher.onMessage(message);
  });
}

export function applicationCommands(
  builtins: readonly CommandDef[],
  services: LumiServices,
): SharedSlashCommand[] {
  const commands = [...builtins, ...services.modules.commands()];
  const seen = new Set<string>();
  return commands.map((command) => {
    if (seen.has(command.name)) throw new Error(`Duplicate command: ${command.name}`);
    seen.add(command.name);
    if (command.build) {
      try {
        return command.build();
      } catch {
        // A deterministic builder was validated at load; fall back instead of
        // letting one bad builder block every command registration.
      }
    }
    return new SlashCommandBuilder().setName(command.name).setDescription(command.description);
  });
}

async function guildPrefix(services: LumiServices, guildId: string | null): Promise<string> {
  if (!guildId) return services.runtime.defaultPrefix;
  const guild = await services.db.guild.get(guildId);
  return guild?.prefix ?? services.runtime.defaultPrefix;
}

async function execute(
  services: LumiServices,
  command: CommandDef,
  context: CommandContext,
): Promise<void> {
  try {
    if (command.guildOnly && !context.guildId) {
      await context.reply(makeErrorCard("Server only", "This command can only be used in a server."));
      return;
    }
    if (command.ownerOnly && !isBotOwner(services, context.user.id)) {
      await context.reply(makeErrorCard("Not allowed", "This command is restricted to bot owners."));
      return;
    }
    if (command.guildOwnerOnly && context.guild?.ownerId !== context.user.id) {
      await context.reply(makeErrorCard("Not allowed", "This command is restricted to the server owner."));
      return;
    }
    if (command.requiredPermissions && !context.member?.permissions.has(command.requiredPermissions)) {
      await context.reply(makeErrorCard("Missing permissions", "You do not have permission to run this command."));
      return;
    }
    if (command.permitNode && context.guildId) {
      const nodes = Array.isArray(command.permitNode) ? command.permitNode : [command.permitNode];
      let hasAny = false;
      for (const node of nodes) {
        if (
          await hasPermit(services, {
            guildId: context.guildId,
            userId: context.user.id,
            channelId: context.channel?.id ?? undefined,
            member: context.member ?? undefined,
            guildOwnerId: context.guild?.ownerId ?? undefined,
            node,
          })
        ) {
          hasAny = true;
          break;
        }
      }
      if (!hasAny) {
        const nodeStr = nodes.map((n) => `\`${n}\``).join(" or ");
        await context.reply(
          context.isSlash
            ? ephemeralCard(makeErrorCard("Permission denied", `You lack the required permit (${nodeStr}) to run this command.`))
            : makeErrorCard("Permission denied", `You lack the required permit (${nodeStr}) to run this command.`),
        );
        return;
      }
    }
    if (command.module !== null && !(await services.modules.isEnabled(context.guildId, command.module))) {
      await context.reply(makeErrorCard("Module disabled", `The **${command.module}** module is disabled here.`));
      return;
    }

    const cooldownMs = command.cooldownMs ?? 0;
    if (cooldownMs > 0) {
      const key = services.keys.cooldown(
        `cmd:${command.name}`,
        `${context.guildId ?? "dm"}:${context.user.id}`,
      );
      if (!(await claim(services.redis, key, cooldownMs))) {
        await context.reply(makeErrorCard("Slow down", "That command is on cooldown."));
        return;
      }
    }

    await command.run(context);
  } catch (error) {
    services.logger.error({ error, command: command.name, guildId: context.guildId }, "command failed");
    const message = error instanceof Error ? error.message : "Unexpected error";
    await context
      .reply(context.isSlash ? ephemeralCard(makeErrorCard("Something went wrong", message)) : makeErrorCard("Something went wrong", message))
      .catch((replyError: unknown) => {
        services.logger.error({ error: replyError, command: command.name }, "failed to send error reply");
      });
  }
}
