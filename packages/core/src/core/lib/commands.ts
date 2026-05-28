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

interface ReplyOptions {
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

export abstract class EmberCommand extends Command {
  public readonly permissionLevel: PermissionLevel;
  public readonly integrationTypes: ApplicationIntegrationType[];
  public readonly contexts: InteractionContextType[];
  public readonly defaultMemberPermissions: bigint | undefined;

  public constructor(
    context: Command.LoaderContext,
    options: EmberCommand.Options,
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
  ) {
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
    options: EmberCommand.Options,
  ): void {
    super.parseConstructorPreConditions(options);
    const level = options.permissionLevel ?? PermissionLevel.USER;

    if (level === PermissionLevel.BOT_OWNER) {
      this.preconditions.append("BotOwner");
    } else if (level === PermissionLevel.GUILD_OWNER) {
      this.preconditions.append("GuildOwner");
    } else if (level === PermissionLevel.ADMIN) {
      this.preconditions.append("Administrator");
    } else if (level === PermissionLevel.MOD) {
      this.preconditions.append("Moderator");
    }
  }
}

export abstract class EmberSubcommand extends Subcommand {
  public readonly permissionLevel: PermissionLevel;
  public readonly integrationTypes: ApplicationIntegrationType[];
  public readonly contexts: InteractionContextType[];
  public readonly defaultMemberPermissions: bigint | undefined;

  public constructor(
    context: Subcommand.LoaderContext,
    options: EmberSubcommand.Options,
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
  ) {
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
    options: EmberSubcommand.Options,
  ): void {
    super.parseConstructorPreConditions(options);
    const level = options.permissionLevel ?? PermissionLevel.USER;

    if (level === PermissionLevel.BOT_OWNER) {
      this.preconditions.append("BotOwner");
    } else if (level === PermissionLevel.GUILD_OWNER) {
      this.preconditions.append("GuildOwner");
    } else if (level === PermissionLevel.ADMIN) {
      this.preconditions.append("Administrator");
    } else if (level === PermissionLevel.MOD) {
      this.preconditions.append("Moderator");
    }
  }
}

export namespace EmberCommand {
  export type Options = Command.Options & {
    permissionLevel?: PermissionLevel;
    integrationTypes?: ApplicationIntegrationType[];
    contexts?: InteractionContextType[];
    defaultMemberPermissions?: bigint | null;
  };
}

export namespace EmberSubcommand {
  export type Options = Subcommand.Options & {
    permissionLevel?: PermissionLevel;
    integrationTypes?: ApplicationIntegrationType[];
    contexts?: InteractionContextType[];
    defaultMemberPermissions?: bigint | null;
  };
}
