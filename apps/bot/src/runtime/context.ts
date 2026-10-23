import {
  GuildMember,
  MessageFlags,
  type ChatInputCommandInteraction,
  type Guild,
  type Message,
  type TextBasedChannel,
  type User,
} from "discord.js";
import type { CommandContext, CommandDef, LumiServices } from "@lumi/module-kit";
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
  readonly #schema: PrefixSchema;

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
    this.#schema = this.isSlash ? EmptyPrefixSchema : prefixSchema(command);
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
      // Discord string options already contain the full value; `rest` is a
      // prefix-only convenience, not the resolver's `required` argument.
      return (this.source as ChatInputCommandInteraction).options.getString(name);
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
    const first = this.#args[0];
    if (!first) return null;
    if (this.#schema.groups.has(first)) return this.#args[1] ?? null;
    return first;
  }

  public async getUser(name: string): Promise<User | null> {
    if (this.isSlash) {
      return (this.source as ChatInputCommandInteraction).options.getUser(name);
    }
    const raw = this.#args[this.#indexOf(name)];
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
    const raw = this.#args[this.#indexOf(name)];
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
    const subcommand = this.#args[0];
    if (!subcommand) return -1;

    const group = this.#schema.groups.get(subcommand);
    if (group) {
      const nested = group.get(this.#args[1] ?? "");
      const offset = nested?.indexOf(name) ?? -1;
      return offset < 0 ? -1 : 2 + offset;
    }

    const options = this.#schema.subcommands.get(subcommand);
    if (options) {
      const offset = options.indexOf(name);
      return offset < 0 ? -1 : 1 + offset;
    }

    return this.#schema.topLevel.indexOf(name);
  }
}

interface PrefixSchema {
  readonly topLevel: readonly string[];
  readonly subcommands: ReadonlyMap<string, readonly string[]>;
  readonly groups: ReadonlyMap<string, ReadonlyMap<string, readonly string[]>>;
}

const EmptyPrefixSchema: PrefixSchema = {
  topLevel: [],
  subcommands: new Map(),
  groups: new Map(),
};

function prefixSchema(command: CommandDef): PrefixSchema {
  try {
    const options = command.build?.().toJSON().options ?? [];
    const topLevel: string[] = [];
    const subcommands = new Map<string, string[]>();
    const groups = new Map<string, ReadonlyMap<string, string[]>>();

    for (const option of options) {
      if (option.type === 1 && "options" in option) {
        subcommands.set(
          option.name,
          (option.options ?? []).map((child) => child.name),
        );
      } else if (option.type === 2 && "options" in option) {
        const nested = new Map<string, string[]>();
        for (const child of option.options ?? []) {
          if (child.type !== 1) continue;
          nested.set(child.name, (child.options ?? []).map((grandchild) => grandchild.name));
        }
        groups.set(option.name, nested);
      } else {
        topLevel.push(option.name);
      }
    }

    return { topLevel, subcommands, groups };
  } catch {
    return EmptyPrefixSchema;
  }
}
