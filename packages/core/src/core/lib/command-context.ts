import { UserError, type Args } from "@sapphire/framework";
import { fetchT } from "@sapphire/plugin-i18next";
import {
  MessageFlags,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildBasedChannel,
  type GuildMember,
  type InteractionReplyOptions,
  type Message,
  type Role,
  type User,
} from "discord.js";
import type { LumiT } from "#core/i18n/index.js";
import {
  PERMISSION_LEVEL_NAMES,
  resolvePermissionLevel,
  type PermissionLevel,
} from "#lib/permissions.js";
import {
  ephemeralCard,
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
  makeWarningCard,
  type CardReply,
} from "#utilities/cards.js";
import { sendInteractionReply } from "#utilities/command-response.js";

export interface CtxOptionSpec {
  required?: boolean;
  /** Strings only: consume the rest of the message on the prefix path. */
  rest?: boolean;
}

export interface CtxReplyOptions {
  /** Slash replies are ephemeral by default; pass `false` to post publicly. */
  ephemeral?: boolean;
}

function missingArgument(name: string): UserError {
  return new UserError({
    identifier: "MissingArgument",
    message: `Missing required argument \`${name}\`.`,
  });
}

/**
 * Uniform view over a slash interaction or a prefix message so a command
 * handler is written exactly once. Option getters read named slash options on
 * the interaction path and consume positional arguments (in call order) on
 * the prefix path; reply helpers are ephemeral cards on slash and plain
 * replies on prefix.
 */
export class CommandContext {
  #lastPrefixReply: Message | null = null;

  private constructor(
    public readonly source: ChatInputCommandInteraction | Message,
    private readonly args: Args | null,
  ) {}

  public static fromInteraction(
    interaction: ChatInputCommandInteraction,
  ): CommandContext {
    return new CommandContext(interaction, null);
  }

  public static fromMessage(message: Message, args: Args): CommandContext {
    return new CommandContext(message, args);
  }

  // ── Shape ──────────────────────────────────────────────────────────────────

  public get isSlash(): boolean {
    return this.args === null;
  }

  /** The slash interaction — throws on the prefix path; guard with `isSlash`. */
  public get interaction(): ChatInputCommandInteraction {
    if (this.args !== null)
      throw new Error("CommandContext: not an interaction");
    return this.source as ChatInputCommandInteraction;
  }

  /** The prefix message — throws on the slash path; guard with `isSlash`. */
  public get message(): Message {
    if (this.args === null) throw new Error("CommandContext: not a message");
    return this.source as Message;
  }

  public get user(): User {
    return this.isSlash
      ? (this.source as ChatInputCommandInteraction).user
      : (this.source as Message).author;
  }

  public get member(): GuildMember | null {
    const { member } = this.source;
    return member && typeof member === "object" && "roles" in member
      ? (member as GuildMember)
      : null;
  }

  public get guild(): Guild | null {
    return this.source.guild;
  }

  public get guildId(): string | null {
    return this.source.guildId;
  }

  public get channelId(): string {
    return this.source.channelId;
  }

  // ── Options ────────────────────────────────────────────────────────────────
  // Prefix path is positional: getters consume arguments in the order they are
  // called, so read options in the same order the slash builder declares them.

  public async getString(
    name: string,
    spec: CtxOptionSpec = {},
  ): Promise<string | null> {
    if (this.isSlash)
      return this.interaction.options.getString(name, spec.required ?? false);
    const value = spec.rest
      ? await this.args!.rest("string").catch(() => null)
      : await this.args!.pick("string").catch(() => null);
    if (value === null && spec.required) throw missingArgument(name);
    return value;
  }

  public async getInteger(
    name: string,
    spec: CtxOptionSpec = {},
  ): Promise<number | null> {
    if (this.isSlash)
      return this.interaction.options.getInteger(name, spec.required ?? false);
    const value = await this.args!.pick("integer").catch(() => null);
    if (value === null && spec.required) throw missingArgument(name);
    return value;
  }

  public async getNumber(
    name: string,
    spec: CtxOptionSpec = {},
  ): Promise<number | null> {
    if (this.isSlash)
      return this.interaction.options.getNumber(name, spec.required ?? false);
    const value = await this.args!.pick("number").catch(() => null);
    if (value === null && spec.required) throw missingArgument(name);
    return value;
  }

  public async getBoolean(
    name: string,
    spec: CtxOptionSpec = {},
  ): Promise<boolean | null> {
    if (this.isSlash)
      return this.interaction.options.getBoolean(name, spec.required ?? false);
    const value = await this.args!.pick("boolean").catch(() => null);
    if (value === null && spec.required) throw missingArgument(name);
    return value;
  }

  public async getUser(
    name: string,
    spec: CtxOptionSpec = {},
  ): Promise<User | null> {
    if (this.isSlash)
      return this.interaction.options.getUser(name, spec.required ?? false);
    const value = await this.args!.pick("user").catch(() => null);
    if (value === null && spec.required) throw missingArgument(name);
    return value;
  }

  public async getMember(
    name: string,
    spec: CtxOptionSpec = {},
  ): Promise<GuildMember | null> {
    if (this.isSlash) {
      const member = this.interaction.options.getMember(name);
      if (!member && spec.required) throw missingArgument(name);
      return member as GuildMember | null;
    }
    const value = await this.args!.pick("member").catch(() => null);
    if (value === null && spec.required) throw missingArgument(name);
    return value;
  }

  public async getRole(
    name: string,
    spec: CtxOptionSpec = {},
  ): Promise<Role | null> {
    if (this.isSlash)
      return this.interaction.options.getRole(
        name,
        spec.required ?? false,
      ) as Role | null;
    const value = await this.args!.pick("role").catch(() => null);
    if (value === null && spec.required) throw missingArgument(name);
    return value;
  }

  public async getChannel(
    name: string,
    spec: CtxOptionSpec = {},
  ): Promise<GuildBasedChannel | null> {
    if (this.isSlash)
      return this.interaction.options.getChannel(
        name,
        spec.required ?? false,
      ) as GuildBasedChannel | null;
    const value = await this.args!.pick("guildChannel").catch(() => null);
    if (value === null && spec.required) throw missingArgument(name);
    return value as GuildBasedChannel | null;
  }

  // ── Replies ────────────────────────────────────────────────────────────────

  public async defer(opts: CtxReplyOptions = {}): Promise<void> {
    if (!this.isSlash) return;
    const { interaction } = this;
    if (interaction.deferred || interaction.replied) return;
    await interaction.deferReply(
      opts.ephemeral === false ? {} : { flags: MessageFlags.Ephemeral },
    );
  }

  /**
   * Send a card. Slash: ephemeral by default (pass `ephemeral: false` for a
   * public reply). Prefix: a plain reply; subsequent calls edit the first
   * reply so progress cards don't stack.
   */
  public async reply(
    card: CardReply,
    opts: CtxReplyOptions = {},
  ): Promise<void> {
    if (this.isSlash) {
      const payload = opts.ephemeral === false ? card : ephemeralCard(card);
      await sendInteractionReply(
        this.interaction,
        payload as InteractionReplyOptions,
        "edit",
      );
      return;
    }
    // Never ping from card bodies that may interpolate user input.
    const payload = { ...card, allowedMentions: {} };
    if (this.#lastPrefixReply) {
      await this.#lastPrefixReply.edit(payload);
      return;
    }
    this.#lastPrefixReply = await this.message.reply(payload);
  }

  public replySuccess(
    title: string,
    body: string,
    opts?: CtxReplyOptions,
  ): Promise<void> {
    return this.reply(makeSuccessCard(title, body), opts);
  }

  public replyError(
    title: string,
    body: string,
    opts?: CtxReplyOptions,
  ): Promise<void> {
    return this.reply(makeErrorCard(title, body), opts);
  }

  public replyWarning(
    title: string,
    body: string,
    opts?: CtxReplyOptions,
  ): Promise<void> {
    return this.reply(makeWarningCard(title, body), opts);
  }

  public replyInfo(
    title: string,
    body: string,
    opts?: CtxReplyOptions,
  ): Promise<void> {
    return this.reply(makeInfoCard(title, body), opts);
  }

  /** Localized translator for the invoker's guild language. */
  public fetchT(): Promise<LumiT> {
    return fetchT(this.source) as unknown as Promise<LumiT>;
  }

  /** Per-subcommand permission elevation — throws a rendered denial. */
  public async checkPermission(level: PermissionLevel): Promise<void> {
    const actual = await resolvePermissionLevel(this.source);
    if (actual < level) {
      throw new UserError({
        identifier: "PermissionDenied",
        message: `You need at least **${PERMISSION_LEVEL_NAMES[level]}** level to use this.`,
      });
    }
  }
}
