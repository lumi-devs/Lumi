import { container, type Container } from "#src/lib/Services.js";
import type {
  ChatInputCommandInteraction,
  Guild,
  Message,
} from "discord.js";
import { authorize } from "#src/lib/api/permissions/Authorize.js";
import { explainPermit } from "#src/lib/api/permissions/PermitResolver.js";
import { memberRoleIds, permitSubject } from "#src/lib/api/permissions/Subject.js";
import { handleDenied } from "#src/lib/utilities/CommandResponse.js";
import { UserError } from "#src/shared/Index.ts";

export interface GateSource {
  userId: string;
  guildId: string | null;
  guild: Pick<Guild, "id" | "ownerId"> | null;
  member: unknown;
  channelId: string | null;
}

export interface GateDenial {
  identifier: string;
  message: string;
  i18nKey?: string;
  i18nParams?: Record<string, unknown>;
}

export interface GateCommand {
  module?: string | undefined;
  locationFull?: string | undefined;
  requiredPermit?: string | undefined;
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

async function checkGuildOwner(source: GateSource): Promise<GateDenial | null> {
  const allowed = await authorize(
    { userId: source.userId, guildOwnerId: source.guild?.ownerId ?? null },
    { kind: "guildOwner" },
  );
  return allowed
    ? null
    : {
        identifier: "PermissionDenied",
        message: "Only the server owner can use this.",
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
  const denial = await checkPermitNode(
    source,
    node,
    `You lack the required permit (\`${node}\`) to use this.`,
  );
  if (!denial || !source.guildId) return denial;
  const rows = await explainPermit(node, {
    guildId: source.guildId,
    userId: source.userId,
    roleIds: memberRoleIds(source.member),
    channelId: source.channelId ?? undefined,
    guildOwnerId: source.guild?.ownerId ?? null,
  });
  const decisive = rows.filter((row) => row.verdict !== "pass");
  if (decisive.length === 0) return denial;
  const mark = (verdict: string): string =>
    verdict === "allow" ? "✅" : "⛔";
  return {
    ...denial,
    message:
      `${denial.message}\n` +
      decisive
        .map((row) => `-# ${mark(row.verdict)} \`${row.tier}\` → ${row.verdict}${row.detail ? ` (${row.detail})` : ""}`)
        .join("\n"),
  };
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

async function checkAccessLists(source: GateSource): Promise<GateDenial | null> {
  const allowed = await container.db.access.allowedByLists(
    source.userId,
    source.guildId,
  );
  return allowed
    ? null
    : {
        identifier: "Blocked",
        message: "You are blocked from using this bot.",
      };
}

function moduleNameFor(command: GateCommand): string | null {
  if (command.module) return command.module;
  const loc = command.locationFull ?? "";

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

export const preconditionChecks: Record<string, GateCheck> = {
  AccessLists: checkAccessLists,
  GuildOnly: checkGuildOnly,
  BotOwner: checkBotOwner,
  GuildOwner: checkGuildOwner,
  LumiPermission: checkLumiPermission,
  MaintenanceMode: checkMaintenanceMode,
  ModuleEnabled: checkModuleEnabled,
};

export interface GateRun {
  names: readonly string[];
  command: GateCommand;
}

export async function denyGated(
  services: Container,
  target: ChatInputCommandInteraction | Message,
  source: GateSource,
  gates: GateRun,
): Promise<boolean> {
  let denial: GateDenial | null = null;
  for (const name of gates.names) {
    const check = preconditionChecks[name];
    if (!check) {
      services.logger.error(`[denyGated] Unknown gate "${name}" - denying closed.`);
      denial = {
        identifier: "PermissionDenied",
        message: "This command is misconfigured.",
      };
      break;
    }
    denial = await check(source, gates.command);
    if (denial) break;
  }
  if (!denial) return false;
  const error = new UserError({
    identifier: denial.identifier,
    message: denial.message,
    ...(denial.i18nKey
      ? { context: { i18nKey: denial.i18nKey, ...denial.i18nParams } }
      : {}),
  });
  await handleDenied(services, target, error, { context: {} });
  return true;
}
