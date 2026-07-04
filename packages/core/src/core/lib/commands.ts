import {
  Command,
  UserError,
  type ApplicationCommandRegistry,
  type Args,
} from "@sapphire/framework";
import { Subcommand } from "@sapphire/plugin-subcommands";
import { CommandContext } from "#core/lib/command-context.js";
import { fetchT } from "@sapphire/plugin-i18next";
import type { LumiT } from "#core/i18n/index.js";
import type {
  ChatInputCommandInteraction,
  MessageContextMenuCommandInteraction,
  UserContextMenuCommandInteraction,
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
  type CardReply,
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

/** Interactions the card reply helpers accept — slash and context-menu commands. */
export type CommandReplyTarget =
  | ChatInputCommandInteraction
  | MessageContextMenuCommandInteraction
  | UserContextMenuCommandInteraction;

export async function sendReply(
  interaction: CommandReplyTarget,
  payload: InteractionReplyOptions,
): Promise<void> {
  // Delegates to the single interaction-reply primitive; "followUp" preserves
  // the prior behavior of appending when a reply already exists.
  await sendInteractionReply(interaction, payload, "followUp");
}

// All four reply helpers share the same ephemeral-branching shape and differ
// only by which card factory they call, so they're generated from one factory.
type CardFactory = (title: string, body: string) => CardReply;

function makeReplyHelper(factory: CardFactory) {
  return (
    interaction: CommandReplyTarget,
    title: string,
    body: string,
    opts: ReplyOptions = {},
  ): Promise<void> =>
    sendReply(
      interaction,
      opts.ephemeral === false
        ? factory(title, body)
        : ephemeralCard(factory(title, body)),
    );
}

export const replySuccess = makeReplyHelper(makeSuccessCard);
export const replyError = makeReplyHelper(makeErrorCard);
export const replyWarning = makeReplyHelper(makeWarningCard);
export const replyInfo = makeReplyHelper(makeInfoCard);

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

interface LumiCommandExtras {
  permissionLevel?: PermissionLevel;
  integrationTypes?: ApplicationIntegrationType[];
  contexts?: InteractionContextType[];
  defaultMemberPermissions?: bigint | null;
  /**
   * Opt the command into prefix (message) invocation. Slash-only by default;
   * single-source handlers (`run(ctx)` / subcommand `run:` mappings) get their
   * message bridge generated only when this is set.
   */
  prefixEnabled?: boolean;
}

// ── Single-source handler bridges ────────────────────────────────────────────
// Commands implement one handler taking a CommandContext; the base classes
// generate the chatInputRun/messageRun bridges (message only when
// `prefixEnabled`). Subcommands declare `{ name, run: "method" }` mappings.

const CTX_WRAPPER_PREFIX = { chat: "__ctxCi$", message: "__ctxMsg$" } as const;

type CtxHandler = (ctx: CommandContext) => unknown;

/** Structural view of a subcommand mapping entry that may carry `run`. */
interface RunMappingEntry {
  run?: string;
  type?: string;
  entries?: RunMappingEntry[];
  chatInputRun?: unknown;
  messageRun?: unknown;
  [key: string]: unknown;
}

/**
 * Rewrite `{ run: "method" }` mapping entries to point at the generated
 * wrapper method names. Collects the referenced method names so the
 * constructor can define the wrappers after `super()`.
 */
function transformRunMappings(
  entries: RunMappingEntry[] | undefined,
  prefixEnabled: boolean,
  collected: Set<string>,
): RunMappingEntry[] | undefined {
  if (!entries) return entries;
  return entries.map((entry) => {
    if (entry.type === "group") {
      return {
        ...entry,
        entries: transformRunMappings(entry.entries, prefixEnabled, collected),
      };
    }
    if (!entry.run) return entry;
    const { run, ...rest } = entry;
    collected.add(run);
    return {
      ...rest,
      chatInputRun: `${CTX_WRAPPER_PREFIX.chat}${run}`,
      ...(prefixEnabled
        ? { messageRun: `${CTX_WRAPPER_PREFIX.message}${run}` }
        : {}),
    };
  });
}

/** Define the instance wrapper methods the rewritten mappings reference. */
function defineCtxWrappers(
  piece: object,
  runNames: Set<string>,
  prefixEnabled: boolean,
): void {
  const self = piece as Record<string, unknown>;
  for (const name of runNames) {
    const handler = self[name];
    if (typeof handler !== "function") {
      throw new Error(
        `Subcommand mapping "run: ${name}" does not match a method on ${piece.constructor.name}.`,
      );
    }
    self[`${CTX_WRAPPER_PREFIX.chat}${name}`] = (
      interaction: ChatInputCommandInteraction,
    ) =>
      (handler as CtxHandler).call(
        piece,
        CommandContext.fromInteraction(interaction),
      );
    if (prefixEnabled) {
      self[`${CTX_WRAPPER_PREFIX.message}${name}`] = (
        message: Message,
        args: Args,
      ) =>
        (handler as CtxHandler).call(
          piece,
          CommandContext.fromMessage(message, args),
        );
    }
  }
}

interface SharedCommandOptions extends LumiCommandExtras {
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

function fetchTyped(
  target: ChatInputCommandInteraction | Message,
): Promise<LumiT> {
  return fetchT(target) as unknown as Promise<LumiT>;
}

// ── Automatic builder defaults ───────────────────────────────────────────────

/** Minimal structural view of the builders the shared defaults apply to. */
interface DefaultsApplicableBuilder {
  setDefaultMemberPermissions(permissions: bigint | null): unknown;
  setContexts(...contexts: InteractionContextType[]): unknown;
  setIntegrationTypes(...types: ApplicationIntegrationType[]): unknown;
}

/**
 * Shadow `registerApplicationCommands` (the same instance-shadowing pattern as
 * {@link instrumentCommandPiece}) so every chat-input / context-menu builder
 * receives the shared defaults — `defaultMemberPermissions`, `contexts`,
 * `integrationTypes` — before the subclass's builder callback runs. Commands
 * never repeat the setter trio, and can still override any of the three by
 * calling the setter themselves inside their builder chain.
 */
function autoApplyCommandDefaults(piece: BaseCommand | BaseSubcommand): void {
  // eslint-disable-next-line @typescript-eslint/unbound-method -- bound to `piece` on the next line
  const method = piece.registerApplicationCommands;
  if (typeof method !== "function") return;
  const original = method.bind(piece);

  const applyDefaults = <T>(builder: T): T => {
    const b = builder as unknown as DefaultsApplicableBuilder;
    b.setDefaultMemberPermissions(piece.defaultMemberPermissions ?? null);
    b.setContexts(...piece.contexts);
    b.setIntegrationTypes(...piece.integrationTypes);
    return builder;
  };

  // Callbacks get a pre-defaulted builder; prebuilt builders are defaulted
  // directly; plain command-data objects pass through untouched.
  const wrapInput = <I>(input: I): I => {
    if (typeof input === "function") {
      const fn = input as unknown as (builder: unknown) => unknown;
      return ((builder: unknown) => fn(applyDefaults(builder))) as unknown as I;
    }
    if (
      typeof input === "object" &&
      input !== null &&
      "setIntegrationTypes" in input
    ) {
      return applyDefaults(input);
    }
    return input;
  };

  Object.defineProperty(piece, "registerApplicationCommands", {
    configurable: true,
    writable: true,
    async value(registry: ApplicationCommandRegistry): Promise<void> {
      /* eslint-disable @typescript-eslint/unbound-method -- saved for restoration; always invoked via .call(registry) */
      const chat = registry.registerChatInputCommand;
      const menu = registry.registerContextMenuCommand;
      /* eslint-enable @typescript-eslint/unbound-method */
      registry.registerChatInputCommand = (input, options) =>
        chat.call(registry, wrapInput(input), options);
      registry.registerContextMenuCommand = (input, options) =>
        menu.call(registry, wrapInput(input), options);
      try {
        await original(registry);
      } finally {
        registry.registerChatInputCommand = chat;
        registry.registerContextMenuCommand = menu;
      }
    },
  });
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
    interaction: CommandReplyTarget,
    payload: InteractionReplyOptions,
  ): Promise<void>;
  replySuccess(
    interaction: CommandReplyTarget,
    title: string,
    body: string,
    opts?: ReplyOptions,
  ): Promise<void>;
  replyError(
    interaction: CommandReplyTarget,
    title: string,
    body: string,
    opts?: ReplyOptions,
  ): Promise<void>;
  replyWarning(
    interaction: CommandReplyTarget,
    title: string,
    body: string,
    opts?: ReplyOptions,
  ): Promise<void>;
  replyInfo(
    interaction: CommandReplyTarget,
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

  /**
   * Single-source handler: implement this instead of `chatInputRun` /
   * `messageRun` and the constructor generates both bridges (message only
   * when `prefixEnabled`).
   */
  public run?(ctx: CommandContext): Awaited<unknown> | Promise<unknown>;

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
    if (typeof this.run === "function") {
      this.chatInputRun = (interaction: ChatInputCommandInteraction) =>
        this.run!(CommandContext.fromInteraction(interaction));
      if (options.prefixEnabled) {
        this.messageRun = (message: Message, args: Args) =>
          this.run!(CommandContext.fromMessage(message, args));
      }
    }
    instrumentCommandPiece(this);
    autoApplyCommandDefaults(this);
  }

  public checkPermission(
    interaction: ChatInputCommandInteraction,
    level: PermissionLevel,
  ): Promise<void> {
    return assertPermissionLevel(interaction, level);
  }

  public reply(
    interaction: CommandReplyTarget,
    payload: InteractionReplyOptions,
  ): Promise<void> {
    return sendReply(interaction, payload);
  }

  public replySuccess(
    interaction: CommandReplyTarget,
    title: string,
    body: string,
    opts?: ReplyOptions,
  ): Promise<void> {
    return replySuccess(interaction, title, body, opts);
  }

  public replyError(
    interaction: CommandReplyTarget,
    title: string,
    body: string,
    opts?: ReplyOptions,
  ): Promise<void> {
    return replyError(interaction, title, body, opts);
  }

  public replyWarning(
    interaction: CommandReplyTarget,
    title: string,
    body: string,
    opts?: ReplyOptions,
  ): Promise<void> {
    return replyWarning(interaction, title, body, opts);
  }

  public replyInfo(
    interaction: CommandReplyTarget,
    title: string,
    body: string,
    opts?: ReplyOptions,
  ): Promise<void> {
    return replyInfo(interaction, title, body, opts);
  }

  public fetchT(target: ChatInputCommandInteraction | Message): Promise<LumiT> {
    return fetchTyped(target);
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
    const runNames = new Set<string>();
    const subcommands = transformRunMappings(
      options.subcommands as RunMappingEntry[] | undefined,
      options.prefixEnabled ?? false,
      runNames,
    );
    super(context, {
      ...options,
      subcommands: subcommands as BaseSubcommand.Options["subcommands"],
    });
    this.permissionLevel = defaults.permissionLevel;
    this.integrationTypes = defaults.integrationTypes;
    this.contexts = defaults.contexts;
    this.defaultMemberPermissions = defaults.defaultMemberPermissions;
    defineCtxWrappers(this, runNames, options.prefixEnabled ?? false);
    instrumentCommandPiece(this);
    autoApplyCommandDefaults(this);
  }

  public checkPermission(
    interaction: ChatInputCommandInteraction,
    level: PermissionLevel,
  ): Promise<void> {
    return assertPermissionLevel(interaction, level);
  }

  public reply(
    interaction: CommandReplyTarget,
    payload: InteractionReplyOptions,
  ): Promise<void> {
    return sendReply(interaction, payload);
  }

  public replySuccess(
    interaction: CommandReplyTarget,
    title: string,
    body: string,
    opts?: ReplyOptions,
  ): Promise<void> {
    return replySuccess(interaction, title, body, opts);
  }

  public replyError(
    interaction: CommandReplyTarget,
    title: string,
    body: string,
    opts?: ReplyOptions,
  ): Promise<void> {
    return replyError(interaction, title, body, opts);
  }

  public replyWarning(
    interaction: CommandReplyTarget,
    title: string,
    body: string,
    opts?: ReplyOptions,
  ): Promise<void> {
    return replyWarning(interaction, title, body, opts);
  }

  public replyInfo(
    interaction: CommandReplyTarget,
    title: string,
    body: string,
    opts?: ReplyOptions,
  ): Promise<void> {
    return replyInfo(interaction, title, body, opts);
  }

  public fetchT(target: ChatInputCommandInteraction | Message): Promise<LumiT> {
    return fetchTyped(target);
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
  export type Options = Command.Options & LumiCommandExtras;
}

/** Subcommand mapping entries may declare `run: "method"` — a single-source
 * handler `(ctx: CommandContext) => unknown` bridged to slash (and prefix when
 * `prefixEnabled`) by the constructor. */
type LumiSubcommandMappings = NonNullable<Subcommand.Options["subcommands"]>;
type LumiMappingEntry = LumiSubcommandMappings[number];
type WithRun<T> = T extends { entries: infer E extends readonly unknown[] }
  ? Omit<T, "entries"> & { entries: Array<WithRun<E[number]>> }
  : T & { run?: string };

export namespace BaseSubcommand {
  export type Options = Omit<Subcommand.Options, "subcommands"> &
    LumiCommandExtras & {
      subcommands?: Array<WithRun<LumiMappingEntry>>;
    };
}

export { CommandContext } from "#core/lib/command-context.js";
