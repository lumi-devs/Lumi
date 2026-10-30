import type { ListenerDefinition, ModuleServices } from "@lumi/module-kit";
import {
  Events,
  type GuildBasedChannel,
  GuildMember,
  type Interaction,
  type Message,
  type MessageReaction,
  type PartialMessageReaction,
  type PartialUser,
  type User,
} from "discord.js";
import { getCustomCommandsConfig, getMessagePrefix } from "./config.js";
import { executeCustomCommand, notifyProblem } from "./engine.js";
import { listEnabledCommands } from "./store.js";
import {
  emojiMatches,
  isMessageTrigger,
  matchMessageTrigger,
  matchesCustomId,
} from "./trigger.js";
import type {
  CustomCommandRow,
  ExecutionReplyTarget,
  TriggerType,
} from "./types.js";

async function memberFor(
  guild: Message["guild"],
  userId: string,
): Promise<GuildMember | null> {
  if (!guild) return null;
  return guild.members.cache.get(userId) ?? guild.members.fetch(userId).catch(() => null);
}

async function runMatched(
  services: ModuleServices,
  command: CustomCommandRow,
  options: {
    guild: NonNullable<Message["guild"]>;
    actor: User;
    member: GuildMember | null;
    channel: GuildBasedChannel | null;
    message?: Message | null;
    args: string[];
    modalFields?: Record<string, string>;
    selectValues?: string[];
    reply: ExecutionReplyTarget;
  },
  type: TriggerType,
): Promise<void> {
  const result = await executeCustomCommand(services, command, {
    guild: options.guild,
    actor: options.actor,
    member: options.member,
    channel: options.channel,
    message: options.message ?? null,
    args: options.args,
    trigger: { type, value: command.trigger },
    modalFields: options.modalFields,
    selectValues: options.selectValues,
    reply: options.reply,
  });

  if (result.status === "forbidden") {
    await notifyProblem(
      options.reply,
      "Not Permitted",
      `You do not have any permission node required by **${command.name}**.`,
      "🚫",
    );
  } else if (result.status === "cooldown") {
    await notifyProblem(
      options.reply,
      "Cooldown",
      `**${command.name}** is on cooldown for another ${result.remaining}s.`,
      "⏳",
    );
  } else if (result.status === "error") {
    services.observability?.logger?.warn?.(
      "[custom-commands] execution failed",
      { guildId: options.guild.id, command: command.name, error: result.message },
    );
  }
}

async function handleMessage(
  message: Message,
  services: ModuleServices,
): Promise<void> {
  if (!message.guild || message.author.bot) return;

  const config = await getCustomCommandsConfig(services, message.guild.id);
  if (!config.enabled || !config.prefixEnabled) return;

  const prefix = await getMessagePrefix(services, message.guild.id, config);
  const commands = await listEnabledCommands(services, message.guild.id);

  for (const command of commands) {
    const type = command.triggerType as TriggerType;
    if (!isMessageTrigger(type)) continue;
    const args = matchMessageTrigger(type, command.trigger, message.content, prefix);
    if (args === null) continue;

    await runMatched(
      services,
      command,
      {
        guild: message.guild,
        actor: message.author,
        member: message.member,
        channel: message.channel as GuildBasedChannel | null,
        message,
        args,
        reply: { kind: "message", message },
      },
      type,
    );
    return;
  }
}

async function resolveReaction(
  reaction: MessageReaction | PartialMessageReaction,
): Promise<{ reaction: MessageReaction; message: Message } | null> {
  const full = reaction.partial ? await reaction.fetch().catch(() => null) : reaction;
  if (!full) return null;
  const message = full.message.partial
    ? await full.message.fetch().catch(() => null)
    : full.message;
  if (!message?.guild) return null;
  return { reaction: full, message };
}

async function handleReaction(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
  services: ModuleServices,
  type: "reactionAdd" | "reactionRemove",
): Promise<void> {
  if (user.bot) return;
  const resolved = await resolveReaction(reaction);
  if (!resolved) return;
  const { message } = resolved;
  const guild = message.guild;
  if (!guild) return;

  const config = await getCustomCommandsConfig(services, guild.id);
  if (!config.enabled) return;

  const commands = await listEnabledCommands(services, guild.id);
  const command = commands.find(
    (entry) =>
      entry.triggerType === type &&
      emojiMatches(entry.trigger, resolved.reaction.emoji),
  );
  if (!command) return;

  const actor = user.partial ? await user.fetch().catch(() => null) : user;
  if (!actor) return;

  await runMatched(
    services,
    command,
    {
      guild,
      actor,
      member: await memberFor(guild, actor.id),
      channel: message.channel as GuildBasedChannel | null,
      message,
      args: [],
      reply: { kind: "message", message },
    },
    type,
  );
}

function interactionType(interaction: Interaction): TriggerType | null {
  if (interaction.isButton()) return "button";
  if (interaction.isAnySelectMenu()) return "select";
  if (interaction.isModalSubmit()) return "modal";
  return null;
}

async function handleInteraction(
  interaction: Interaction,
  services: ModuleServices,
): Promise<void> {
  if (interaction.isChatInputCommand() || interaction.isAutocomplete()) return;
  const type = interactionType(interaction);
  if (!type) return;
  const customId = (interaction as { customId?: string }).customId;
  if (!interaction.guild || !customId) return;

  const config = await getCustomCommandsConfig(services, interaction.guild.id);
  if (!config.enabled) return;

  const commands = await listEnabledCommands(services, interaction.guild.id);
  const command = commands.find(
    (entry) =>
      entry.triggerType === type &&
      matchesCustomId(entry.trigger, customId),
  );
  if (!command) return;

  const member =
    interaction.member instanceof GuildMember
      ? interaction.member
      : await interaction.guild.members
          .fetch(interaction.user.id)
          .catch(() => null);

  let modalFields: Record<string, string> | undefined;
  if (interaction.isModalSubmit()) {
    modalFields = {};
    for (const field of interaction.fields.fields.values()) {
      const input = field as { customId: string; value?: string | null };
      modalFields[input.customId] = input.value ?? "";
    }
  }

  await runMatched(
    services,
    command,
    {
      guild: interaction.guild,
      actor: interaction.user,
      member,
      channel: interaction.channel as GuildBasedChannel | null,
      args: interaction.isAnySelectMenu() ? interaction.values : [],
      selectValues: interaction.isAnySelectMenu() ? interaction.values : undefined,
      modalFields,
      reply: { kind: "interaction", interaction },
    },
    type,
  );
}

export const messageListener: ListenerDefinition = {
  event: Events.MessageCreate,
  async handler(message: Message, services: ModuleServices) {
    await handleMessage(message, services);
  },
};

export const reactionAddListener: ListenerDefinition = {
  event: Events.MessageReactionAdd,
  async handler(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
    services: ModuleServices,
  ) {
    await handleReaction(reaction, user, services, "reactionAdd");
  },
};

export const reactionRemoveListener: ListenerDefinition = {
  event: Events.MessageReactionRemove,
  async handler(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
    services: ModuleServices,
  ) {
    await handleReaction(reaction, user, services, "reactionRemove");
  },
};

export const interactionListener: ListenerDefinition = {
  event: Events.InteractionCreate,
  async handler(interaction: Interaction, services: ModuleServices) {
    await handleInteraction(interaction, services);
  },
};
