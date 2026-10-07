import { container } from "#lib/services.js";
import type {
  ChatInputCommandInteraction,
  Guild,
  Message,
} from "discord.js";
import { authorize } from "#lib/permissions/authorize.js";
import { permitSubject } from "#lib/permissions/subject.js";

/** Invocation facts a gate reads, normalized off either source. */
export interface GateSource {
  userId: string;
  guildId: string | null;
  guild: Pick<Guild, "id" | "ownerId"> | null;
  member: unknown;
  channelId: string | null;
}

/** A failed gate: the same identifier/message/i18n the store piece denied with. */
export interface GateDenial {
  identifier: string;
  message: string;
  i18nKey?: string;
  i18nParams?: Record<string, unknown>;
}

/** Command-side facts gates read: plain data, nothing store-shaped. */
export interface GateCommand {
  module?: string;
  locationFull?: string;
  requiredPermit?: string;
}

export type GateCheck = (
  source: GateSource,
  command: GateCommand,
  context?: unknown,
) => Promise<GateDenial | null>;

export function gateSourceFromChatInput(
  interaction: ChatInputCommandInteraction,
): GateSource {
  return {
    userId: interaction.user.id,
    guildId: interaction.guildId,
    guild: interaction.guild,
    member: interaction.member,
    channelId: interaction.channelId,
  };
}

export function gateSourceFromMessage(message: Message): GateSource {
  return {
    userId: message.author.id,
    guildId: message.guildId,
    guild: message.guild,
    member: message.member,
    channelId: message.channelId,
  };
}

async function checkPermitNode(
  source: GateSource,
  node: string,
  message: string,
  extra?: Pick<GateDenial, "i18nKey" | "i18nParams">,
): Promise<GateDenial | null> {
  const subject = permitSubject(
    source.guild,
    source.userId,
    source.member,
    source.channelId,
  );
  if (!subject) {
    return {
      identifier: "PermissionDenied",
      message: "This command can only be used in a server.",
    };
  }
  const allowed = await authorize(subject, { kind: "permit", node });
  return allowed ? null : { identifier: "PermissionDenied", message, ...extra };
}

function checkGuildOnly(source: GateSource): Promise<GateDenial | null> {
  return Promise.resolve(
    source.guildId
      ? null
      : {
          identifier: "preconditionGuildOnly",
          message: "You cannot run this command in DMs.",
        },
  );
}

async function checkBotOwner(source: GateSource): Promise<GateDenial | null> {
  const allowed = await authorize({ userId: source.userId }, { kind: "botOwner" });
  return allowed
    ? null
    : {
        identifier: "PermissionDenied",
        message: "You need at least **Bot Owner** level to use this.",
        i18nKey: "preconditions:botOwner",
      };
}

async function checkLumiPermission(
  source: GateSource,
  command: GateCommand,
  context?: unknown,
): Promise<GateDenial | null> {
  const node =
    typeof context === "string" && context.length > 0
      ? context
      : command.requiredPermit;
  if (!node) return null;
  return checkPermitNode(
    source,
    node,
    `You lack the required permit (\`${node}\`) to use this.`,
  );
}

async function checkMaintenanceMode(
  source: GateSource,
): Promise<GateDenial | null> {
  const globalConfig = await container.db.global.getGlobalConfig();
  if (!globalConfig.maintenanceMode) return null;
  if (await authorize({ userId: source.userId }, { kind: "botOwner" })) {
    return null;
  }
  return {
    identifier: "MaintenanceMode",
    message:
      globalConfig.maintenanceMessage ??
      "The bot is currently undergoing maintenance. Please try again later.",
  };
}

function moduleNameFor(command: GateCommand): string | null {
  if (command.module) return command.module;
  const loc = command.locationFull ?? "";
  // ponytail: regex fallback only; moduleStore is the real resolver
  return /modules[/\\]([^/\\]+)[/\\]/.exec(loc)?.[1] ?? null;
}

async function checkModuleEnabled(
  source: GateSource,
  command: GateCommand,
): Promise<GateDenial | null> {
  const moduleName =
    command.module ??
    (command.locationFull
      ? container.moduleStore.moduleNameForLocation(command.locationFull)
      : null) ??
    moduleNameFor(command);
  if (!moduleName) return null;
  if (
    container.moduleStore &&
    !container.moduleStore.isModuleDisableable(moduleName)
  ) {
    return null;
  }
  const enabled = await container.db.modules.isModuleEnabled(
    source.guildId,
    moduleName,
  );
  if (enabled) return null;
  return {
    identifier: "ModuleEnabled",
    message: source.guildId
      ? `The **${moduleName}** module is disabled in this server.`
      : "This feature is currently disabled.",
    i18nKey: "preconditions:moduleDisabled",
    i18nParams: { module: moduleName },
  };
}

/** Plain gates keyed by the store name each piece used to register under. */
export const preconditionChecks: Record<string, GateCheck> = {
  GuildOnly: checkGuildOnly,
  BotOwner: checkBotOwner,
  LumiPermission: checkLumiPermission,
  MaintenanceMode: checkMaintenanceMode,
  ModuleEnabled: checkModuleEnabled,
};
