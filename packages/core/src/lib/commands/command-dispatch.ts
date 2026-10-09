import { UserError } from "@lumi/shared";
import type { Container } from "#lib/services.js";
import {
  ApplicationIntegrationType,
  InteractionContextType,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type Client,
  type Guild,
  type Message,
  type MessageContextMenuCommandInteraction,
} from "discord.js";
import { CommandContext } from "#lib/commands/context.js";
import {
  commandRegistry,
  asHandler,
  type CommandDef,
  type SubcommandHandler,
} from "#lib/commands/command-def.js";
import { PrefixArgs } from "#lib/commands/prefix-args.js";
import { authorize } from "#lib/permissions/authorize.js";
import {
  gateSourceFromChatInput,
  gateSourceFromMessage,
  type GateSource,
} from "#lib/permissions/precondition-checks.js";
import { memberRoleIds } from "#lib/permissions/subject.js";
import { denyGated } from "#lib/commands/gates.js";
import { instrumentedRun } from "#lib/telemetry/instrument.js";
import {
  handleDenied,
  resolveErrorCard,
  respond,
  respondMessage,
} from "#lib/utilities/command-response.js";
import { ephemeralCard, makeWarningCard } from "#lib/ui/cards.js";
import { getDefaultPrefix } from "#lib/env.js";

function denyCommand(
  services: Container,
  target: ChatInputCommandInteraction | Message,
  source: GateSource,
  def: CommandDef,
  handler?: SubcommandHandler,
): Promise<boolean> {
  const requiredPermit = handler?.requiredPermit ?? def.requiredPermit;
  const names = ["MaintenanceMode", "ModuleEnabled"];
  if (def.guildOnly || handler?.guildOnly) names.push("GuildOnly");
  if (def.botOwner || handler?.botOwner) names.push("BotOwner");
  if (requiredPermit) names.push("LumiPermission");
  return denyGated(services, target, source, {
    names,
    command: { module: def.module, requiredPermit },
  });
}

const cooldowns = new Map<string, number>();

function cooldownHit(cmdName: string, userId: string, ms: number): number | null {
  const now = Date.now();
  const key = `${userId}:${cmdName}`;
  const expiresAt = cooldowns.get(key);
  if (expiresAt !== undefined && expiresAt > now) {
    return expiresAt - now;
  }
  cooldowns.set(key, now + ms);
  if (cooldowns.size > 10000) {
    for (const [k, exp] of cooldowns) {
      if (exp <= now) cooldowns.delete(k);
    }
  }
  return null;
}

function checkClientPermissions(
  def: CommandDef,
  guild: Guild | null,
  channelId: string,
): boolean {
  const required = def.requiredClientPermissions ?? [];
  if (required.length === 0 || !guild) return true;
  const me = guild.members.me;
  if (!me) return false;
  const channel = guild.channels.cache.get(channelId);
  const perms = channel ? me.permissionsIn(channel) : me.permissions;
  return required.every((flag) => perms.has(flag));
}

async function denyMissingClientPermissions(
  services: Container,
  target:
    | ChatInputCommandInteraction
    | MessageContextMenuCommandInteraction
    | Message,
): Promise<void> {
  await handleDenied(
    services,
    target,
    new UserError({
      identifier: "ClientPermissionsMissing",
      message: "I don't have permission to do that here.",
    }),
    { context: {} },
  );
}

async function reportChatError(
  services: Container,
  def: CommandDef,
  interaction: ChatInputCommandInteraction,
  error: unknown,
): Promise<void> {
  try {
    const { card } = resolveErrorCard(`Command:${def.name}`, error);
    await respond(interaction, card);
  } catch (reportError) {
    services.logger.error(
      `[CommandDispatch:${def.name}] Failed to report command error:`,
      reportError,
    );
  }
}

function subcommandKey(
  group: string | null,
  sub: string,
): string {
  return group ? `${group}:${sub}` : sub;
}

export async function dispatchChatInput(
  services: Container,
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const def = commandRegistry.get(interaction.commandName);
  if (!def) return;
  if (await denyCommand(services, interaction, gateSourceFromChatInput(interaction), def)) {
    return;
  }
  const wait = def.cooldownMs
    ? cooldownHit(def.name, interaction.user.id, def.cooldownMs)
    : null;
  if (wait !== null) {
    await respond(
      interaction,
      ephemeralCard(
        makeWarningCard(
          "Slow Down",
          `Try again in ${Math.ceil(wait / 1000)}s.`,
        ),
      ),
    );
    return;
  }
  try {
    if (def.handlers) {
      const group = interaction.options.getSubcommandGroup(false);
      const sub = interaction.options.getSubcommand();
      const raw = def.handlers[subcommandKey(group, sub)];
      if (!raw) {
        services.logger.warn(
          `[CommandDispatch:${def.name}] Unknown subcommand ${subcommandKey(group, sub)}.`,
        );
        return;
      }
      const handler = asHandler(raw);
      if (
        await denyCommand(
          services,
          interaction,
          gateSourceFromChatInput(interaction),
          def,
          handler,
        )
      ) {
        return;
      }
      if (!(await checkClientPermissions(def, interaction.guild, interaction.channelId))) {
        await denyMissingClientPermissions(services, interaction);
        return;
      }
      await instrumentedRun(def.name, "chat", interaction, () =>
        handler.run(CommandContext.fromInteraction(interaction, services)),
      );
      return;
    }
    if (!def.run) return;
    if (!(await checkClientPermissions(def, interaction.guild, interaction.channelId))) {
      await denyMissingClientPermissions(services, interaction);
      return;
    }
    await instrumentedRun(def.name, "chat", interaction, () =>
      def.run!(CommandContext.fromInteraction(interaction, services)),
    );
  } catch (error) {
    await reportChatError(services, def, interaction, error);
  }
}

export async function dispatchContextMenu(
  services: Container,
  interaction: MessageContextMenuCommandInteraction,
): Promise<void> {
  const def = commandRegistry.get(interaction.commandName);
  if (!def?.contextMenu) return;
  const source = {
    userId: interaction.user.id,
    guildId: interaction.guildId,
    guild: interaction.guild,
    member: interaction.member,
    channelId: interaction.channelId,
  };
  if (await denyCommand(services, interaction as unknown as ChatInputCommandInteraction, source, def)) {
    return;
  }
  if (!(await checkClientPermissions(def, interaction.guild, interaction.channelId))) {
    await denyMissingClientPermissions(services, interaction);
    return;
  }
  try {
    await instrumentedRun(def.name, "chat", interaction, () =>
      def.contextMenu!.run(services, interaction),
    );
  } catch (error) {
    const { card } = resolveErrorCard(`Command:${def.name}`, error);
    try {
      await respond(interaction, card);
    } catch (reportError) {
      services.logger.error(
        `[CommandDispatch:${def.name}] Failed to report command error:`,
        reportError,
      );
    }
  }
}

export async function dispatchMessage(
  services: Container,
  client: Client,
  message: Message,
): Promise<void> {
  if (message.partial) {
    const full = await message.fetch().catch(() => null);
    if (!full) return;
    message = full;
  }
  if (message.author.bot || !message.guild) return;
  const prefix = await resolvePrefix(services, client, message);
  if (!prefix) return;
  const withoutPrefix = message.content.slice(prefix.length).trim();
  if (!withoutPrefix) return;
  const [name, ...tokens] = withoutPrefix.split(/ +/g);
  if (!name) return;
  const def = commandRegistry.get(name.toLowerCase());
  if (!def || def.prefixEnabled === false) return;
  if (await denyCommand(services, message, gateSourceFromMessage(message), def)) {
    return;
  }
  const wait = def.cooldownMs
    ? cooldownHit(def.name, message.author.id, def.cooldownMs)
    : null;
  if (wait !== null) {
    await respondMessage(
      message,
      ephemeralCard(
        makeWarningCard(
          "Slow Down",
          `Try again in ${Math.ceil(wait / 1000)}s.`,
        ),
      ),
    );
    return;
  }
  try {
    if (def.handlers) {
      const [first, second] = tokens;
      let key: string | null = null;
      let rest = tokens;
      const aliasKey = def.aliasSub?.[name.toLowerCase()];
      if (aliasKey && def.handlers[aliasKey]) {
        key = aliasKey;
      } else if (
        first &&
        Object.keys(def.handlers).some((k) => k.startsWith(`${first}:`))
      ) {
        key = second ? `${first}:${second}` : null;
        rest = tokens.slice(2);
      } else if (first && def.handlers[first]) {
        key = first;
        rest = tokens.slice(1);
      } else if (def.defaultSub && def.handlers[def.defaultSub]) {
        key = def.defaultSub;
      }
      const raw = key ? def.handlers[key] : undefined;
      if (!raw) {
        await respondMessage(
          message,
          ephemeralCard(makeWarningCard("Unknown subcommand", `Usage: \`${prefix}${def.name} <subcommand>\`.`)),
        );
        return;
      }
      const handler = asHandler(raw);
      if (await denyCommand(services, message, gateSourceFromMessage(message), def, handler)) {
        return;
      }
      if (!(await checkClientPermissions(def, message.guild, message.channelId))) {
        await denyMissingClientPermissions(services, message);
        return;
      }
      const ctx = CommandContext.fromMessage(
        message,
        new PrefixArgs(message, rest.join(" ")),
        services,
      );
      await instrumentedRun(def.name, "message", message, () => handler.run(ctx));
      return;
    }
    if (!def.run) return;
    if (!(await checkClientPermissions(def, message.guild, message.channelId))) {
      await denyMissingClientPermissions(services, message);
      return;
    }
    const ctx = CommandContext.fromMessage(
      message,
      new PrefixArgs(message, tokens.join(" ")),
      services,
    );
    await instrumentedRun(def.name, "message", message, () => def.run!(ctx));
  } catch (error) {
    try {
      const { card } = resolveErrorCard(`Command:${def.name}`, error);
      await respondMessage(message, card);
    } catch (reportError) {
      services.logger.error(
        `[CommandDispatch:${def.name}] Failed to report command error:`,
        reportError,
      );
    }
  }
}

async function resolvePrefix(services: Container, client: Client, message: Message): Promise<string | null> {
  const content = message.content;
  const mention = new RegExp(`^<@!?${client.user?.id}>\\s*`).exec(content);
  if (mention) return mention[0];
  if (!message.guild) return null;
  const settings = await services.db.config.getGuildSettings(message.guild.id);
  const prefixes = [
    settings.prefix,
    (await services.db.global.getGlobalConfig().catch(() => null))
      ?.defaultPrefix,
    getDefaultPrefix(),
  ].filter((p): p is string => typeof p === "string" && p.length > 0);
  for (const prefix of prefixes) {
    if (content.startsWith(prefix)) return prefix;
  }
  return null;
}

export async function dispatchAutocomplete(
  services: Container,
  interaction: AutocompleteInteraction,
): Promise<void> {
  const def = commandRegistry.get(interaction.commandName);
  if (!def?.autocomplete) return;
  if (def.guildOnly && !interaction.guildId) {
    await interaction.respond([]);
    return;
  }
  if (
    def.botOwner &&
    !(await authorize({ userId: interaction.user.id }, { kind: "botOwner" }))
  ) {
    await interaction.respond([]);
    return;
  }
  if (def.requiredPermit) {
    if (!interaction.guild) {
      await interaction.respond([]);
      return;
    }
    const hasPermit = await authorize(
      {
        userId: interaction.user.id,
        guildId: interaction.guild.id,
        roleIds: memberRoleIds(interaction.member),
        channelId: interaction.channelId,
        guildOwnerId: interaction.guild.ownerId,
      },
      { kind: "permit", node: def.requiredPermit },
    );
    if (!hasPermit) {
      await interaction.respond([]);
      return;
    }
  }
  try {
    await def.autocomplete(services, interaction);
  } catch (err) {
    services.logger.warn(
      `[CommandDispatch:${interaction.commandName}] autocomplete failed:`,
      err,
    );
    await interaction.respond([]).catch(() => undefined);
  }
}

export function finalizeBuilder(def: CommandDef) {
  if (!def.build) throw new Error(`Command ${def.name} has no slash builder.`);
  const builder = def.build();
  const guildOnly = def.guildOnly ?? false;
  builder.setDefaultMemberPermissions(def.defaultMemberPermissions ?? null);
  builder.setContexts(
    ...(guildOnly
      ? [InteractionContextType.Guild]
      : [
          InteractionContextType.Guild,
          InteractionContextType.BotDM,
          InteractionContextType.PrivateChannel,
        ]),
  );
  builder.setIntegrationTypes(ApplicationIntegrationType.GuildInstall);
  return builder;
}
