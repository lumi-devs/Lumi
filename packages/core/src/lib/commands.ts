import { CommandContext } from "#lib/command-context.js";
import type { LumiT } from "#lib/i18n/index.js";
import { memberRoleIds } from "#lib/permissions/preconditions/RequirePermit.js";
import { instrumentCommandPiece } from "#lib/telemetry/instrument.js";
import { sendInteractionReply } from "#lib/utilities/command-response.js";
import {
  ephemeralCard,
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
  makeWarningCard,
  type CardReply,
} from "#lib/utilities/cards.js";
import {
  BucketScope,
  Command,
  UserError,
  container,
  type ApplicationCommandRegistry,
  type Args,
} from "@sapphire/framework";
import { fetchT } from "@sapphire/plugin-i18next";
import { Subcommand } from "@sapphire/plugin-subcommands";
import {
  ApplicationIntegrationType,
  InteractionContextType,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type InteractionReplyOptions,
  type Message,
  type MessageContextMenuCommandInteraction,
  type UserContextMenuCommandInteraction,
} from "discord.js";

export { fetchT };
export { CommandContext } from "#lib/command-context.js";
export { BucketScope };

export interface ReplyOptions {
  /** Explicitly opt out of ephemeral. Replies are ephemeral by default. */
  ephemeral?: boolean;
}

/** Interactions the card reply helpers accept - slash and context-menu commands. */
export type CommandReplyTarget =
  | ChatInputCommandInteraction
  | MessageContextMenuCommandInteraction
  | UserContextMenuCommandInteraction;

/**
 * Sends a structured reply (or follow-up) to a given command interaction.
 *
 * @param interaction - The interaction to reply to.
 * @param payload - The message payload.
 */
export async function sendReply(
  interaction: CommandReplyTarget,
  payload: InteractionReplyOptions,
): Promise<void> {
  await sendInteractionReply(interaction, payload, "followUp");
}

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

/**
 * Throws a `PermissionDenied` {@linkcode UserError} unless the invoking member
 * holds `permitNode` in the interaction's guild.
 *
 * @param interaction - The interaction whose invoker is being checked.
 * @param permitNode - The permit node to require, e.g. `admin.*`.
 */
export async function assertPermit(
  interaction: ChatInputCommandInteraction,
  permitNode: string,
): Promise<void> {
  const guildId = interaction.guild?.id;
  if (!guildId) {
    throw new UserError({
      identifier: "PermissionDenied",
      message: "This command can only be used in a server.",
    });
  }
  const userId = interaction.user.id;
  const roleIds = memberRoleIds(interaction.member);
  const guildOwnerId = interaction.guild?.ownerId;
  const hasPermit = await container.permitResolver.hasPermit({
    guildId,
    userId,
    roleIds,
    channelId: interaction.channelId,
    permitNode,
    guildOwnerId,
  });
  if (!hasPermit) {
    throw new UserError({
      identifier: "PermissionDenied",
      message: `You lack the required permit (\`${permitNode}\`) to use this.`,
    });
  }
}

/** Resolves the i18next translator for a target as Lumi's typed {@linkcode LumiT}. */
export function fetchTyped(
  target: Parameters<typeof fetchT>[0],
): Promise<LumiT> {
  return fetchT(target) as unknown as Promise<LumiT>;
}

function mapRequiredPermitToDiscordPermission(
  permit: string | undefined,
): bigint | undefined {
  if (!permit) return undefined;
  if (permit.startsWith("admin")) return PermissionFlagsBits.ManageGuild;
  if (permit.startsWith("mod")) return PermissionFlagsBits.ManageMessages;
  return undefined;
}

function appendPermitPrecondition(
  instance: { preconditions: Command["preconditions"] },
  permitNode: string | undefined,
): void {
  if (permitNode) {
    instance.preconditions.append("RequirePermit");
  }
}

interface LumiCommandExtras {
  /** Permit node required to invoke the command, e.g. `mod.ban`. */
  requiredPermit?: string;
  /** @default [ApplicationIntegrationType.GuildInstall] */
  integrationTypes?: ApplicationIntegrationType[];
  /**
   * Interaction contexts the command may be invoked from. Defaults to guilds
   * only when the command declares the `GuildOnly` precondition, otherwise
   * guilds plus DMs and private channels.
   */
  contexts?: InteractionContextType[];
  /**
   * Discord-side permission gate. Defaults to the permission implied by
   * {@linkcode LumiCommandExtras.requiredPermit}.
   */
  defaultMemberPermissions?: bigint | null;
  /**
   * Opt the command into prefix (message) invocation. Slash-only by default;
   * single-source handlers (`run(ctx)` / subcommand `run:` mappings) get their
   * message bridge generated only when this is set.
   */
  prefixEnabled?: boolean;
  /** Number of command executions allowed within the cooldown duration window. */
  cooldownLimit?: number;
  /** Cooldown duration in milliseconds. */
  cooldownDelay?: number;
  /** Cooldown scope bucket: User (default), Guild, Channel, or Global. */
  cooldownScope?: BucketScope;
}

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
  const target = piece as Record<string, unknown>;
  for (const name of runNames) {
    const handler = target[name];
    if (typeof handler !== "function") {
      throw new Error(
        `Subcommand mapping "run: ${name}" does not match a method on ${piece.constructor.name}.`,
      );
    }
    target[`${CTX_WRAPPER_PREFIX.chat}${name}`] = (
      interaction: ChatInputCommandInteraction,
    ) =>
      (handler as CtxHandler).call(
        piece,
        CommandContext.fromInteraction(interaction),
      );
    if (prefixEnabled) {
      target[`${CTX_WRAPPER_PREFIX.message}${name}`] = (
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
  requiredPermit: string | undefined;
  integrationTypes: ApplicationIntegrationType[];
  contexts: InteractionContextType[];
  defaultMemberPermissions: bigint | undefined;
}

function resolveCommandDefaults(
  options: SharedCommandOptions,
): ResolvedCommandDefaults {
  const discordPerm = mapRequiredPermitToDiscordPermission(
    options.requiredPermit,
  );
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
    requiredPermit: options.requiredPermit,
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

/** The registration-time defaults a piece contributes to its own builders. */
interface CommandLike {
  readonly requiredPermit: string | undefined;
  readonly integrationTypes: ApplicationIntegrationType[];
  readonly contexts: InteractionContextType[];
  readonly defaultMemberPermissions: bigint | undefined;
}

/** Minimal structural view of the builders the shared defaults apply to. */
interface DefaultsApplicableBuilder {
  setDefaultMemberPermissions(permissions: bigint | null): unknown;
  setContexts(...contexts: InteractionContextType[]): unknown;
  setIntegrationTypes(...types: ApplicationIntegrationType[]): unknown;
}

function applyCommandDefaults<T>(builder: T, piece: CommandLike): T {
  const target = builder as DefaultsApplicableBuilder;
  target.setDefaultMemberPermissions(piece.defaultMemberPermissions ?? null);
  target.setContexts(...piece.contexts);
  target.setIntegrationTypes(...piece.integrationTypes);
  return builder;
}

/**
 * Seeds `input` with the piece's shared defaults.
 *
 * @remarks
 *
 * For the callback form the defaults are written onto the builder *before* the
 * subclass's callback runs, so a command that calls `setContexts` (or either of
 * the other two setters) in its own chain overwrites them. For the pre-built
 * form there is no such window, so the defaults are written on registration.
 */
function withCommandDefaults<T>(input: T, piece: CommandLike): T {
  if (typeof input === "function") {
    const build = input as (builder: unknown) => unknown;
    return ((builder: unknown) =>
      build(applyCommandDefaults(builder, piece))) as T;
  }
  if (
    typeof input === "object" &&
    input !== null &&
    "setIntegrationTypes" in input
  ) {
    return applyCommandDefaults(input, piece);
  }
  return input;
}

/**
 * Builds a delegating view of `registry` that seeds every builder handed to it
 * with the piece's shared defaults before forwarding the registration.
 *
 * @remarks
 *
 * The view inherits from `registry`, so any other member a command reaches for
 * resolves to the real registry unchanged. Only the two register methods are
 * owned by the view, and the view is handed to the subclass instead of the real
 * registry - the registry itself is never mutated.
 */
function createDefaultsRegistry(
  registry: ApplicationCommandRegistry,
  piece: CommandLike,
): ApplicationCommandRegistry {
  const view = Object.create(registry) as ApplicationCommandRegistry;
  view.registerChatInputCommand = (input, options) => {
    registry.registerChatInputCommand(
      withCommandDefaults(input, piece),
      options,
    );
    return view;
  };
  view.registerContextMenuCommand = (input, options) => {
    registry.registerContextMenuCommand(
      withCommandDefaults(input, piece),
      options,
    );
    return view;
  };
  return view;
}

/**
 * Shadow `registerApplicationCommands` on the instance (the same pattern as
 * {@linkcode instrumentCommandPiece}) so the subclass's implementation - at
 * whatever depth of the prototype chain it lives - is handed a defaults-seeding
 * registry view rather than the raw registry. Commands therefore never repeat
 * the `setDefaultMemberPermissions` / `setContexts` / `setIntegrationTypes`
 * trio, yet can still override any of the three in their own builder chain.
 */
function shadowRegistrationDefaults(piece: BaseCommand | BaseSubcommand): void {
  const register = piece.registerApplicationCommands;
  if (typeof register !== "function") return;
  const original = register.bind(piece);

  Object.defineProperty(piece, "registerApplicationCommands", {
    configurable: true,
    writable: true,
    async value(registry: ApplicationCommandRegistry): Promise<void> {
      await original(createDefaultsRegistry(registry, piece));
    },
  });
}

/**
 * The base class that all standalone Lumi commands must extend.
 *
 * @remarks
 *
 * The constructor resolves the shared Discord-facing defaults, bridges the
 * single-source {@linkcode BaseCommand.run} handler onto `chatInputRun` (and
 * `messageRun` when `prefixEnabled`), instruments the run methods, and arranges
 * for the defaults to be seeded onto every builder the subclass registers.
 */
export abstract class BaseCommand extends Command implements CommandLike {
  public readonly requiredPermit: string | undefined;
  public readonly integrationTypes: ApplicationIntegrationType[];
  public readonly contexts: InteractionContextType[];
  public readonly defaultMemberPermissions: bigint | undefined;

  public constructor(
    context: Command.LoaderContext,
    options: BaseCommand.Options,
  ) {
    const defaults = resolveCommandDefaults(options);
    super(context, { ...options });
    this.requiredPermit = defaults.requiredPermit;
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
    shadowRegistrationDefaults(this);
  }

  /**
   * Single-source handler: implement this instead of `chatInputRun` /
   * `messageRun` and the constructor generates both bridges (message only
   * when `prefixEnabled`).
   */
  public run?(ctx: CommandContext): Awaited<unknown> | Promise<unknown>;

  /**
   * Appends the `RequirePermit` precondition when the command declares a
   * permit node, plus the `MaintenanceMode` and `ModuleEnabled` gates every
   * Lumi command carries.
   */
  protected override parseConstructorPreConditions(
    options: BaseCommand.Options,
  ): void {
    super.parseConstructorPreConditions(options);
    this.preconditions.append("MaintenanceMode");
    appendPermitPrecondition(this, options.requiredPermit);
    this.preconditions.append("ModuleEnabled");
  }
}

/**
 * The base class that all Lumi subcommand groups must extend.
 *
 * @remarks
 *
 * Behaves like {@linkcode BaseCommand}, and additionally rewrites
 * `run: "methodName"` mapping entries into generated wrapper methods so a
 * subcommand handler can take a {@linkcode CommandContext} directly.
 */
export abstract class BaseSubcommand extends Subcommand implements CommandLike {
  public readonly requiredPermit: string | undefined;
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
    this.requiredPermit = defaults.requiredPermit;
    this.integrationTypes = defaults.integrationTypes;
    this.contexts = defaults.contexts;
    this.defaultMemberPermissions = defaults.defaultMemberPermissions;
    defineCtxWrappers(this, runNames, options.prefixEnabled ?? false);
    instrumentCommandPiece(this);
    shadowRegistrationDefaults(this);
  }

  /**
   * Appends the `RequirePermit` precondition when the command declares a
   * permit node, plus the `MaintenanceMode` and `ModuleEnabled` gates every
   * Lumi command carries.
   */
  protected override parseConstructorPreConditions(
    options: BaseSubcommand.Options,
  ): void {
    super.parseConstructorPreConditions(options);
    this.preconditions.append("MaintenanceMode");
    appendPermitPrecondition(this, options.requiredPermit);
    this.preconditions.append("ModuleEnabled");
  }
}

/**
 * Subcommand mapping entries may declare `run: "method"` - a single-source
 * handler `(ctx: CommandContext) => unknown` bridged to slash (and prefix when
 * `prefixEnabled`) by the constructor.
 */
type LumiSubcommandMappings = NonNullable<Subcommand.Options["subcommands"]>;
type LumiMappingEntry = LumiSubcommandMappings[number];
type WithRun<T> = T extends { entries: infer E extends readonly unknown[] }
  ? Omit<T, "entries"> & { entries: Array<WithRun<E[number]>> }
  : T & { run?: string };

export namespace BaseCommand {
  export type Options = Command.Options & LumiCommandExtras;
  export type LoaderContext = Command.LoaderContext;
  export type Registry = Command.Registry;
}

export namespace BaseSubcommand {
  export type Options = Omit<Subcommand.Options, "subcommands"> &
    LumiCommandExtras & {
      subcommands?: Array<WithRun<LumiMappingEntry>>;
    };
  export type LoaderContext = Subcommand.LoaderContext;
  export type Registry = Subcommand.Registry;
}
