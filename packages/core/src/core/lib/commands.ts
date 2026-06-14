import { Command, UserError } from "@sapphire/framework";
import { Subcommand } from "@sapphire/plugin-subcommands";
import { fetchT } from "@sapphire/plugin-i18next";
import type { LumiT } from "#core/i18n/index.js";
import type {
  ChatInputCommandInteraction,
  InteractionReplyOptions,
  Message,
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
import { sendInteractionReply } from "#utilities/command-response.js";

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
  // Delegates to the single interaction-reply primitive; "followUp" preserves
  // the prior behavior of appending when a reply already exists.
  await sendInteractionReply(interaction, payload, "followUp");
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
  instance: { preconditions: Command["preconditions"] },
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

// ── Shared constructor resolution ────────────────────────────────────────────
// BaseCommand extends Command and BaseSubcommand extends Subcommand, so they
// cannot share a parent. These free helpers hold the identical option-resolution
// and permission-check logic so it lives in exactly one place (mirrors Skyra's
// `BaseSkyraCommandUtilities`).

interface SharedCommandOptions {
  permissionLevel?: PermissionLevel;
  integrationTypes?: ApplicationIntegrationType[];
  contexts?: InteractionContextType[];
  defaultMemberPermissions?: bigint | null;
  preconditions?: Command.Options["preconditions"];
}

interface ResolvedCommandDefaults {
  permissionLevel: PermissionLevel;
  integrationTypes: ApplicationIntegrationType[];
  contexts: InteractionContextType[];
  defaultMemberPermissions: bigint | undefined;
}

function resolveCommandDefaults(
  options: SharedCommandOptions,
): ResolvedCommandDefaults {
  const discordPerm = mapPermissionLevelToDiscordPermission(
    options.permissionLevel,
  );
  // GuildOnly may be declared as a bare string or as an object entry
  // (`{ name: "GuildOnly", ... }`); detect both. `.includes("GuildOnly")` alone
  // silently misses the object form.
  const isGuildOnly =
    Array.isArray(options.preconditions) &&
    options.preconditions.some((p) =>
      typeof p === "string"
        ? p === "GuildOnly"
        : typeof p === "object" && p !== null && "name" in p
          ? p.name === "GuildOnly"
          : false,
    );
  return {
    permissionLevel: options.permissionLevel ?? PermissionLevel.USER,
    integrationTypes: options.integrationTypes ?? [
      ApplicationIntegrationType.GuildInstall,
    ],
    contexts: options.contexts ?? [
      InteractionContextType.Guild,
      ...(isGuildOnly
        ? []
        : [
            InteractionContextType.BotDM,
            InteractionContextType.PrivateChannel,
          ]),
    ],
    defaultMemberPermissions: options.defaultMemberPermissions ?? discordPerm,
  };
}

async function assertPermissionLevel(
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
  /**
   * Resolves the localized translation function for the target's language
   * (guild language → Discord locale → en-US). Pass an interaction or a
   * message; returns an i18next `TFunction` bound to the resolved language.
   */
  fetchT(target: ChatInputCommandInteraction | Message): Promise<LumiT>;
}

// ── BaseCommand ──────────────────────────────────────────────────────────────
// NOTE: BaseCommand and BaseSubcommand intentionally duplicate their (trivial,
// delegating) instance bodies. They can't share a parent — BaseCommand extends
// Command, BaseSubcommand extends Subcommand — and a mixin can't be used either:
// `declaration: true` rejects an exported class extending an anonymous mixin
// that carries Sapphire's protected members (TS4094). The real logic lives once
// in the free functions above; these wrappers are pure delegation.

export abstract class BaseCommand extends Command implements CommandLike {
  public readonly permissionLevel: PermissionLevel;
  public readonly integrationTypes: ApplicationIntegrationType[];
  public readonly contexts: InteractionContextType[];
  public readonly defaultMemberPermissions: bigint | undefined;

  public constructor(
    context: Command.LoaderContext,
    options: BaseCommand.Options,
  ) {
    const defaults = resolveCommandDefaults(options);
    super(context, { ...options });
    this.permissionLevel = defaults.permissionLevel;
    this.integrationTypes = defaults.integrationTypes;
    this.contexts = defaults.contexts;
    this.defaultMemberPermissions = defaults.defaultMemberPermissions;
    instrumentCommandPiece(this);
  }

  public checkPermission(
    interaction: ChatInputCommandInteraction,
    level: PermissionLevel,
  ): Promise<void> {
    return assertPermissionLevel(interaction, level);
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

  public fetchT(
    target: ChatInputCommandInteraction | Message,
  ): Promise<LumiT> {
    return fetchT(target) as unknown as Promise<LumiT>;
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
    const defaults = resolveCommandDefaults(options);
    super(context, { ...options });
    this.permissionLevel = defaults.permissionLevel;
    this.integrationTypes = defaults.integrationTypes;
    this.contexts = defaults.contexts;
    this.defaultMemberPermissions = defaults.defaultMemberPermissions;
    instrumentCommandPiece(this);
  }

  public checkPermission(
    interaction: ChatInputCommandInteraction,
    level: PermissionLevel,
  ): Promise<void> {
    return assertPermissionLevel(interaction, level);
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

  public fetchT(
    target: ChatInputCommandInteraction | Message,
  ): Promise<LumiT> {
    return fetchT(target) as unknown as Promise<LumiT>;
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
