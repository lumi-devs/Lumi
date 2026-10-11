import { UserError } from "#src/shared/Index.ts";
import { container, type Container } from "#src/lib/Services.js";
import type { PrefixArgs } from "#src/lib/commands/PrefixArgs.js";
import { fetchT } from "#src/lib/i18n/Index.js";
import {
  GuildMember,
  MessageFlags,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildBasedChannel,
  type Message,
  type Role,
  type User,
} from "discord.js";
import type { LumiT } from "#src/lib/i18n/Index.js";
import { ephemeralCard, makeErrorCard, makeInfoCard, makeSuccessCard, makeWarningCard, makeEmptyCard, type CardReply } from "#src/lib/ui/Cards.js";
import { sendInteractionReply } from "#src/lib/utilities/CommandResponse.js";
import { permitSubject } from "#src/lib/permissions/Subject.js";
import { BrandColors } from "#src/lib/ui/Palette.js";
import { getGuildContext } from "#src/lib/cache/GuildContext.js";

export interface CtxOptionSpec {
  required?: boolean;

  rest?: boolean;
}

export interface CtxReplyOptions {

  ephemeral?: boolean;
}

const defaultMaxMultiTargets = 10;

function missingArgument(name: string): UserError {
  return new UserError({
    identifier: "MissingArgument",
    message: `Missing required argument \`${name}\`.`,
  });
}

export class CommandContext {
  #lastPrefixReply: Message | null = null;

  private constructor(
    public readonly source: ChatInputCommandInteraction | Message,
    private readonly args: PrefixArgs | null,

    public readonly services: Container = container,
  ) {}

  public get isSlash(): boolean {
    return this.args === null;
  }

  public get interaction(): ChatInputCommandInteraction {
    if (this.args !== null)
      throw new Error("CommandContext: not an interaction");
    return this.source as ChatInputCommandInteraction;
  }

  public get message(): Message {
    if (this.args === null) throw new Error("CommandContext: not a message");
    return this.source as Message;
  }

  public get user(): User {
    if (this.isSlash) return (this.source as ChatInputCommandInteraction).user;
    return (this.source as Message).author;
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

  public async getString(
    name: string,
    spec: CtxOptionSpec = {},
  ): Promise<string | null> {
    if (this.isSlash)
      return this.interaction.options.getString(name, spec.required ?? false);
    return this.pickPrefix(name, spec, (args) =>
      spec.rest ? args.rest("string") : args.pick("string"),
    );
  }

  public async getInteger(
    name: string,
    spec: CtxOptionSpec = {},
  ): Promise<number | null> {
    if (this.isSlash)
      return this.interaction.options.getInteger(name, spec.required ?? false);
    return this.pickPrefix(name, spec, (args) => args.pick("integer"));
  }

  public async getNumber(
    name: string,
    spec: CtxOptionSpec = {},
  ): Promise<number | null> {
    if (this.isSlash)
      return this.interaction.options.getNumber(name, spec.required ?? false);
    return this.pickPrefix(name, spec, (args) => args.pick("number"));
  }

  public async getBoolean(
    name: string,
    spec: CtxOptionSpec = {},
  ): Promise<boolean | null> {
    if (this.isSlash)
      return this.interaction.options.getBoolean(name, spec.required ?? false);
    return this.pickPrefix(name, spec, (args) => args.pick("boolean"));
  }

  public async getUser(
    name: string,
    spec: CtxOptionSpec = {},
  ): Promise<User | null> {
    if (this.isSlash)
      return this.interaction.options.getUser(name, spec.required ?? false);
    return this.pickPrefix(name, spec, (args) => args.pick("user"));
  }

  private async pickPrefix<T>(
    name: string,
    spec: CtxOptionSpec,
    pick: (args: PrefixArgs) => Promise<T>,
  ): Promise<T | null> {
    const value = await pick(this.args!).catch(() => null);
    if (value === null && spec.required) throw missingArgument(name);
    return value;
  }

  private async pickMany(
    type: "member",
    name: string,
    spec: CtxOptionSpec,
  ): Promise<GuildMember[]>;
  private async pickMany(
    type: "user",
    name: string,
    spec: CtxOptionSpec,
  ): Promise<User[]>;
  private async pickMany(
    type: "member" | "user",
    name: string,
    spec: CtxOptionSpec,
  ): Promise<Array<GuildMember | User>> {
    if (this.isSlash) {
      const single =
        type === "member"
          ? await this.getMember(name, spec)
          : await this.getUser(name, spec);
      return single ? [single] : [];
    }
    const result =
      type === "member"
        ? await this.args!.repeatResult("member", {
            times: await this.maxMultiTargets(),
          })
        : await this.args!.repeatResult("user", {
            times: await this.maxMultiTargets(),
          });
    if (result.isErr()) {
      if (spec.required) throw missingArgument(name);
      return [];
    }
    return result.unwrap();
  }

  public async getMember(
    name: string,
    spec: CtxOptionSpec = {},
  ): Promise<GuildMember | null> {
    if (this.isSlash) {
      let member = this.interaction.options.getMember(name);
      if (!member) {
        const user = this.interaction.options.getUser(name);
        if (user && this.interaction.guild) {
          member =
            this.interaction.guild.members.cache?.get(user.id) ??
            (await this.interaction.guild.members.fetch(user.id).catch(() => null));
        }
      }
      if (!member && spec.required) throw missingArgument(name);
      return member as GuildMember | null;
    }
    return this.pickPrefix(name, spec, (args) => args.pick("member"));
  }

  private async maxMultiTargets(): Promise<number> {
    if (!this.guildId) return defaultMaxMultiTargets;
    const configured = await this.services.db.config.getModuleConfig(
      this.guildId,
      "mod",
      "max_multi_targets",
    );
    return typeof configured === "number" && configured > 0
      ? configured
      : defaultMaxMultiTargets;
  }

  public async getMembers(
    name: string,
    spec: CtxOptionSpec = {},
  ): Promise<GuildMember[]> {
    return this.pickMany("member", name, spec);
  }

  public async getUsers(
    name: string,
    spec: CtxOptionSpec = {},
  ): Promise<User[]> {
    return this.pickMany("user", name, spec);
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
    return this.pickPrefix(name, spec, (args) => args.pick("role"));
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
    return this.pickPrefix(name, spec, (args) => args.pick("guildChannel"));
  }

  public async brandColor(): Promise<number> {
    if (this.guildId) {
      const ctx = await getGuildContext(this.services, this.guildId);
      return ctx.brandColor;
    }
    return BrandColors.primary;
  }

  public async defer(opts: CtxReplyOptions = {}): Promise<void> {
    if (!this.isSlash) return;
    const { interaction } = this;
    if (interaction.deferred || interaction.replied) return;
    await interaction.deferReply(
      opts.ephemeral === false ? {} : { flags: MessageFlags.Ephemeral },
    );
  }

  public async reply(
    card: CardReply,
    opts: CtxReplyOptions = {},
  ): Promise<void> {
    if (this.isSlash) {
      const payload = opts.ephemeral === false ? card : ephemeralCard(card);
      await sendInteractionReply(this.interaction, payload, "edit");
      return;
    }
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

  public replyEmpty(
    title: string,
    reason: string,
    suggestion?: string,
    opts?: CtxReplyOptions,
  ): Promise<void> {
    return this.reply(makeEmptyCard(title, reason, suggestion), opts);
  }

  public fetchT(): Promise<LumiT> {
    return fetchT(this.source, this.services);
  }

  public async checkPermit(permitNode: string): Promise<void> {
    const subject = permitSubject(this.guild, this.user.id, this.member, this.channelId);
    if (!subject) {
      throw new UserError({
        identifier: "PermissionDenied",
        message: "This command can only be used in a server.",
      });
    }
    await this.services.permitResolver.assertPermit({ ...subject, permitNode });
  }

  public static fromInteraction(
    interaction: ChatInputCommandInteraction,
    services: Container = container,
  ): CommandContext {
    return new CommandContext(interaction, null, services);
  }

  public static fromMessage(
    message: Message,
    args: PrefixArgs,
    services: Container = container,
  ): CommandContext {
    return new CommandContext(message, args, services);
  }
}
