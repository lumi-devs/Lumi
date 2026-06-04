import { Command, UserError } from "@sapphire/framework";
import { Subcommand } from "@sapphire/plugin-subcommands";
import type {
  ChatInputCommandInteraction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
} from "discord.js";
import {
  PermissionFlagsBits,
  ApplicationIntegrationType,
  InteractionContextType,
} from "discord.js";
import {
  ephemeralCard,
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
  makeWarningCard,
} from "#utilities/cards.js";
import {
  PermissionLevel,
  resolvePermissionLevel,
  PERMISSION_LEVEL_NAMES,
} from "#lib/permissions.js";
import { instrumentCommandPiece } from "#core/telemetry/instrument.js";

function mapPermissionLevelToDiscordPermission(
  level: PermissionLevel | undefined,
): bigint | undefined {
  if (level === undefined || level <= PermissionLevel.USER) return undefined;
  switch (level) {
    case PermissionLevel.BOT_OWNER:
    case PermissionLevel.GUILD_OWNER:
      return 0n;
    case PermissionLevel.ADMIN:
      return PermissionFlagsBits.ManageGuild;
    case PermissionLevel.MOD:
      return PermissionFlagsBits.ManageMessages;
    default:
      return undefined;
  }
}

export interface ReplyOptions {
  /** Explicitly opt out of ephemeral. Replies are ephemeral by default. */
  ephemeral?: boolean;
}

export async function sendReply(
  interaction: ChatInputCommandInteraction,
  payload: InteractionReplyOptions,
): Promise<void> {
  if (interaction.replied) {
    await interaction.followUp(payload);
  } else if (interaction.deferred) {
    await interaction.editReply(payload as InteractionEditReplyOptions);
  } else {
    await interaction.reply(payload);
  }
}

export const replySuccess = (
  interaction: ChatInputCommandInteraction,
  title: string,
  body: string,
  opts: ReplyOptions = {},
): Promise<void> =>
  sendReply(
    interaction,
    opts.ephemeral === false
      ? makeSuccessCard(title, body)
      : ephemeralCard(makeSuccessCard(title, body)),
  );

export const replyError = (
  interaction: ChatInputCommandInteraction,
  title: string,
  body: string,
  opts: ReplyOptions = {},
): Promise<void> =>
  sendReply(
    interaction,
    opts.ephemeral === false
      ? makeErrorCard(title, body)
      : ephemeralCard(makeErrorCard(title, body)),
  );

export const replyWarning = (
  interaction: ChatInputCommandInteraction,
  title: string,
  body: string,
  opts: ReplyOptions = {},
): Promise<void> =>
  sendReply(
    interaction,
    opts.ephemeral === false
      ? makeWarningCard(title, body)
      : ephemeralCard(makeWarningCard(title, body)),
  );

export const replyInfo = (
  interaction: ChatInputCommandInteraction,
  title: string,
  body: string,
  opts: ReplyOptions = {},
): Promise<void> =>
  sendReply(
    interaction,
    opts.ephemeral === false
      ? makeInfoCard(title, body)
      : ephemeralCard(makeInfoCard(title, body)),
  );

// ── Shared precondition registration ────────────────────────────────────────

function appendPermissionPrecondition(
  instance: { preconditions: { append(name: string): void } },
  level: PermissionLevel,
): void {
  if (level === PermissionLevel.BOT_OWNER) {
    instance.preconditions.append("BotOwner");
  } else if (level === PermissionLevel.GUILD_OWNER) {
    instance.preconditions.append("GuildOwner");
  } else if (level === PermissionLevel.ADMIN) {
    instance.preconditions.append("Administrator");
  } else if (level === PermissionLevel.MOD) {
    instance.preconditions.append("Moderator");
  }
}

// ── Shared interface — ensures both base classes stay in sync ────────────────

interface CommandLike {
  readonly permissionLevel: PermissionLevel;
  readonly integrationTypes: ApplicationIntegrationType[];
  readonly contexts: InteractionContextType[];
  readonly defaultMemberPermissions: bigint | undefined;
  checkPermission(
    interaction: ChatInputCommandInteraction,
    level: PermissionLevel,
  ): Promise<void>;
  reply(
    interaction: ChatInputCommandInteraction,
    payload: InteractionReplyOptions,
  ): Promise<void>;
  replySuccess(
    interaction: ChatInputCommandInteraction,
    title: string,
    body: string,
    opts?: ReplyOptions,
  ): Promise<void>;
  replyError(
    interaction: ChatInputCommandInteraction,
    title: string,
    body: string,
    opts?: ReplyOptions,
  ): Promise<void>;
  replyWarning(
    interaction: ChatInputCommandInteraction,
    title: string,
    body: string,
    opts?: ReplyOptions,
  ): Promise<void>;
  replyInfo(
    interaction: ChatInputCommandInteraction,
    title: string,
    body: string,
    opts?: ReplyOptions,
  ): Promise<void>;
}

// ── BaseCommand ──────────────────────────────────────────────────────────────

export abstract class BaseCommand extends Command implements CommandLike {
  public readonly permissionLevel: PermissionLevel;
  public readonly integrationTypes: ApplicationIntegrationType[];
  public readonly contexts: InteractionContextType[];
  public readonly defaultMemberPermissions: bigint | undefined;

  public constructor(
    context: Command.LoaderContext,
    options: BaseCommand.Options,
  ) {
    const discordPerm = mapPermissionLevelToDiscordPermission(
      options.permissionLevel,
    );

    const isGuildOnly = options.preconditions?.includes("GuildOnly") ?? false;
    const integrationTypes = options.integrationTypes ?? [
      ApplicationIntegrationType.GuildInstall,
    ];
    const contexts = options.contexts ?? [
      InteractionContextType.Guild,
      ...(isGuildOnly
        ? []
        : [
            InteractionContextType.BotDM,
            InteractionContextType.PrivateChannel,
          ]),
    ];

    super(context, {
      ...options,
    });

    this.permissionLevel = options.permissionLevel ?? PermissionLevel.USER;
    this.integrationTypes = integrationTypes;
    this.contexts = contexts;
    this.defaultMemberPermissions =
      options.defaultMemberPermissions ?? discordPerm;

    instrumentCommandPiece(this);
  }

  public async checkPermission(
    interaction: ChatInputCommandInteraction,
    level: PermissionLevel,
  ): Promise<void> {
    const actual = await resolvePermissionLevel(interaction);
    if (actual < level) {
      throw new UserError({
        identifier: "PermissionDenied",
        message: `You need at least **${PERMISSION_LEVEL_NAMES[level]}** level to use this.`,
      });
    }
  }

  public reply(
    interaction: ChatInputCommandInteraction,
    payload: InteractionReplyOptions,
  ): Promise<void> {
    return sendReply(interaction, payload);
  }

  public replySuccess(
    interaction: ChatInputCommandInteraction,
    title: string,
    body: string,
    opts?: ReplyOptions,
  ): Promise<void> {
    return replySuccess(interaction, title, body, opts);
  }

  public replyError(
    interaction: ChatInputCommandInteraction,
    title: string,
    body: string,
    opts?: ReplyOptions,
  ): Promise<void> {
    return replyError(interaction, title, body, opts);
  }

  public replyWarning(
    interaction: ChatInputCommandInteraction,
    title: string,
    body: string,
    opts?: ReplyOptions,
  ): Promise<void> {
    return replyWarning(interaction, title, body, opts);
  }

  public replyInfo(
    interaction: ChatInputCommandInteraction,
    title: string,
    body: string,
    opts?: ReplyOptions,
  ): Promise<void> {
    return replyInfo(interaction, title, body, opts);
  }

  protected override parseConstructorPreConditions(
    options: BaseCommand.Options,
  ): void {
    super.parseConstructorPreConditions(options);
    appendPermissionPrecondition(
      this,
      options.permissionLevel ?? PermissionLevel.USER,
    );
  }
}

// ── BaseSubcommand ───────────────────────────────────────────────────────────

export abstract class BaseSubcommand extends Subcommand implements CommandLike {
  public readonly permissionLevel: PermissionLevel;
  public readonly integrationTypes: ApplicationIntegrationType[];
  public readonly contexts: InteractionContextType[];
  public readonly defaultMemberPermissions: bigint | undefined;

  public constructor(
    context: Subcommand.LoaderContext,
    options: BaseSubcommand.Options,
  ) {
    const discordPerm = mapPermissionLevelToDiscordPermission(
      options.permissionLevel,
    );

    const isGuildOnly = options.preconditions?.includes("GuildOnly") ?? false;
    const integrationTypes = options.integrationTypes ?? [
      ApplicationIntegrationType.GuildInstall,
    ];
    const contexts = options.contexts ?? [
      InteractionContextType.Guild,
      ...(isGuildOnly
        ? []
        : [
            InteractionContextType.BotDM,
            InteractionContextType.PrivateChannel,
          ]),
    ];

    super(context, {
      ...options,
    });

    this.permissionLevel = options.permissionLevel ?? PermissionLevel.USER;
    this.integrationTypes = integrationTypes;
    this.contexts = contexts;
    this.defaultMemberPermissions =
      options.defaultMemberPermissions ?? discordPerm;

    instrumentCommandPiece(this);
  }

  public async checkPermission(
    interaction: ChatInputCommandInteraction,
    level: PermissionLevel,
  ): Promise<void> {
    const actual = await resolvePermissionLevel(interaction);
    if (actual < level) {
      throw new UserError({
        identifier: "PermissionDenied",
        message: `You need at least **${PERMISSION_LEVEL_NAMES[level]}** level to use this.`,
      });
    }
  }

  public reply(
    interaction: ChatInputCommandInteraction,
    payload: InteractionReplyOptions,
  ): Promise<void> {
    return sendReply(interaction, payload);
  }

  public replySuccess(
    interaction: ChatInputCommandInteraction,
    title: string,
    body: string,
    opts?: ReplyOptions,
  ): Promise<void> {
    return replySuccess(interaction, title, body, opts);
  }

  public replyError(
    interaction: ChatInputCommandInteraction,
    title: string,
    body: string,
    opts?: ReplyOptions,
  ): Promise<void> {
    return replyError(interaction, title, body, opts);
  }

  public replyWarning(
    interaction: ChatInputCommandInteraction,
    title: string,
    body: string,
    opts?: ReplyOptions,
  ): Promise<void> {
    return replyWarning(interaction, title, body, opts);
  }

  public replyInfo(
    interaction: ChatInputCommandInteraction,
    title: string,
    body: string,
    opts?: ReplyOptions,
  ): Promise<void> {
    return replyInfo(interaction, title, body, opts);
  }

  protected override parseConstructorPreConditions(
    options: BaseSubcommand.Options,
  ): void {
    super.parseConstructorPreConditions(options);
    appendPermissionPrecondition(
      this,
      options.permissionLevel ?? PermissionLevel.USER,
    );
  }
}

export namespace BaseCommand {
  export type Options = Command.Options & {
    permissionLevel?: PermissionLevel;
    integrationTypes?: ApplicationIntegrationType[];
    contexts?: InteractionContextType[];
    defaultMemberPermissions?: bigint | null;
  };
}

export namespace BaseSubcommand {
  export type Options = Subcommand.Options & {
    permissionLevel?: PermissionLevel;
    integrationTypes?: ApplicationIntegrationType[];
    contexts?: InteractionContextType[];
    defaultMemberPermissions?: bigint | null;
  };
}
