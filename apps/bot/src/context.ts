import {
  GuildMember,
  MessageFlags,
  type ChatInputCommandInteraction,
  type Guild,
  type Message,
  type TextBasedChannel,
  type User,
} from "discord.js";
import type { CommandContext, CommandDef, LumiServices } from "@lumi/bot-kit";
import { makeErrorCard, makeInfoCard, makeSuccessCard } from "@lumi/ui";
import type { CardReply } from "@lumi/ui";

export class CommandContextImpl implements CommandContext {
  public readonly services: LumiServices;
  public readonly command: CommandDef;
  public readonly source: ChatInputCommandInteraction | Message;
  public readonly guildId: string | null;
  public readonly guild: Guild | null;
  public readonly channel: TextBasedChannel | null;
  public readonly member: GuildMember | null;
  public readonly user: User;
  public readonly isSlash: boolean;
  readonly #args: readonly string[];
  readonly #optionNames: readonly string[];

  public constructor(
    services: LumiServices,
    command: CommandDef,
    source: ChatInputCommandInteraction | Message,
    args: readonly string[] = [],
  ) {
    this.services = services;
    this.command = command;
    this.source = source;
    this.#args = args;
    this.isSlash = !("content" in source);
    this.#optionNames = this.isSlash ? [] : optionNames(command);
    this.guildId = source.guildId ?? null;
    this.guild = source.guild ?? null;
    this.channel = source.channel ?? null;
    this.member = source.member instanceof GuildMember ? source.member : null;
    this.user = this.isSlash
      ? (source as ChatInputCommandInteraction).user
      : (source as Message).author;
  }

  public async getString(name: string, options?: { rest?: boolean }): Promise<string | null> {
    if (this.isSlash) {
      const interaction = this.source as ChatInputCommandInteraction;
      return interaction.options.getString(name, options?.rest ?? false);
    }
    const index = this.#indexOf(name);
    if (index < 0) return null;
    return options?.rest ? this.#args.slice(index).join(" ") || null : (this.#args[index] ?? null);
  }

  public async getInteger(name: string): Promise<number | null> {
    if (!this.isSlash) {
      const raw = this.#args[this.#indexOf(name)];
      if (raw === undefined) return null;
      const value = Number.parseInt(raw, 10);
      return Number.isFinite(value) ? value : null;
    }
    return (this.source as ChatInputCommandInteraction).options.getInteger(name);
  }

  public async getBoolean(name: string): Promise<boolean | null> {
    if (!this.isSlash) {
      const raw = this.#args[this.#indexOf(name)]?.toLowerCase();
      if (raw === undefined) return null;
      if (["true", "yes", "on", "1"].includes(raw)) return true;
      if (["false", "no", "off", "0"].includes(raw)) return false;
      return null;
    }
    return (this.source as ChatInputCommandInteraction).options.getBoolean(name);
  }

  public getSubcommand(): string | null {
    if (this.isSlash) {
      try {
        return (this.source as ChatInputCommandInteraction).options.getSubcommand();
      } catch {
        return null;
      }
    }
    return this.#args[0] ?? null;
  }

  public async getUser(name: string): Promise<User | null> {
    if (this.isSlash) {
      return (this.source as ChatInputCommandInteraction).options.getUser(name);
    }
    const raw = this.#args[this.#indexOf(name)] ?? this.#args[0];
    if (!raw) return null;
    const cleanId = raw.replace(/[^0-9]/g, "");
    if (!cleanId) return null;
    return this.services.client.users.fetch(cleanId).catch(() => null);
  }

  public async getMember(name: string): Promise<GuildMember | null> {
    if (this.isSlash) {
      const member = (this.source as ChatInputCommandInteraction).options.getMember(name);
      return (member as GuildMember | null) ?? null;
    }
    const raw = this.#args[this.#indexOf(name)] ?? this.#args[0];
    if (!raw || !this.guild) return null;
    const cleanId = raw.replace(/[^0-9]/g, "");
    if (!cleanId) return null;
    return this.guild.members.fetch(cleanId).catch(() => null);
  }

  public async reply(card: CardReply): Promise<unknown> {
    return this.isSlash ? this.#replyInteraction(card) : this.#replyMessage(card);
  }

  public replySuccess(title: string, body: string | string[]): Promise<unknown> {
    return this.reply(makeSuccessCard(title, body));
  }

  public replyError(title: string, body: string | string[]): Promise<unknown> {
    return this.reply(makeErrorCard(title, body));
  }

  public replyInfo(title: string, body: string | string[]): Promise<unknown> {
    return this.reply(makeInfoCard(title, body));
  }

  public async defer(): Promise<void> {
    if (!this.isSlash) return;
    const interaction = this.source as ChatInputCommandInteraction;
    if (!interaction.deferred && !interaction.replied) await interaction.deferReply();
  }

  async #replyInteraction(card: CardReply): Promise<unknown> {
    const interaction = this.source as ChatInputCommandInteraction;
    const editing = interaction.replied || interaction.deferred;
    const flags =
      card.flags === undefined
        ? undefined
        : editing
          ? card.flags & ~MessageFlags.Ephemeral
          : card.flags;
    const payload = {
      components: [...card.components],
      ...(flags === undefined || flags === 0 ? {} : { flags }),
      ...(card.allowedMentions === undefined ? {} : { allowedMentions: card.allowedMentions }),
    };
    if (editing) return interaction.editReply(payload);
    return interaction.reply(payload);
  }

  async #replyMessage(card: CardReply): Promise<unknown> {
    const message = this.source as Message;
    return message.reply({
      components: [...card.components],
      ...(card.flags === undefined ? {} : { flags: card.flags }),
      ...(card.allowedMentions === undefined ? {} : { allowedMentions: card.allowedMentions }),
    });
  }

  #indexOf(name: string): number {
    if (this.#optionNames.length === 0) return 0;
    return this.#optionNames.indexOf(name);
  }
}

function optionNames(command: CommandDef): readonly string[] {
  try {
    const options = command.build?.().toJSON().options ?? [];
    return options.filter((option) => option.type !== 1 && option.type !== 2).map((option) => option.name);
  } catch {
    return [];
  }
}
