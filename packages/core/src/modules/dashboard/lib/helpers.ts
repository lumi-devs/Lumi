import { container } from "@sapphire/framework";
import {
  APPEAL_REVIEW_STATUSES,
  APPEAL_STATUSES,
  WARN_THRESHOLD_ACTIONS,
  type GuildSetupRunResult,
  type RpcRequest,
} from "@lumi/contracts";
import { verifyAppealToken } from "#lib/appeals/token.js";
import type { ModerationCase } from "@prisma/client";
import { s, type BaseValidator } from "@sapphire/shapeshift";
import { getUtility } from "#lib/module-system/Utility.js";
import { ChannelType, type Guild } from "discord.js";

/** Channel types sensible to offer in a CHANNEL config picker by default (no threads, no categories). */
export const PICKABLE_CHANNEL_TYPES = new Set<ChannelType>([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildVoice,
  ChannelType.GuildStageVoice,
  ChannelType.GuildForum,
  ChannelType.GuildMedia,
]);

export const SnowflakeSchema = s.string().regex(/^\d{17,20}$/);

export function requireGuildId(guildId: string | null | undefined): string {
  try {
    if (!guildId) throw new Error();
    SnowflakeSchema.parse(guildId);
    return guildId;
  } catch {
    throw new Error("guildId is required and must be a valid snowflake");
  }
}

export function parsePayload<T>(schema: BaseValidator<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Bad payload: ${msg}`);
  }
}

// Re-checked live against the guild rather than trusted from the dashboard
// session, whose cached guild list can be up to `SESSION_TTL_MS` stale.
export async function requireGuildManager(
  guildId: string,
  actorId: string | undefined,
): Promise<string> {
  if (!actorId) throw new Error("actorId is required");
  const guild = container.client.guilds.cache.get(guildId);
  if (!guild) throw new Error("Guild not found in bot cache");
  if (guild.ownerId === actorId) return actorId;

  const member = await guild.members.fetch(actorId).catch(() => null);
  if (
    !member?.permissions.has("ManageGuild") &&
    !member?.permissions.has("Administrator")
  ) {
    throw new Error("Missing ManageGuild permission");
  }
  return actorId;
}

export async function verifyGuildAccess(
  req: RpcRequest<unknown>,
): Promise<{ guildId: string; actorId: string; guild: Guild }> {
  const guildId = requireGuildId(req.guildId);
  const actorId = await requireGuildManager(guildId, req.actorId);
  const guild = container.client.guilds.cache.get(guildId)!;
  return { guildId, actorId, guild };
}

export function cachedGuild(guildId: string): Guild {
  const guild = container.client.guilds.cache.get(guildId);
  if (!guild) throw new Error("Guild not found in bot cache");
  return guild;
}

/**
 * One-shot guided bootstrap for the dashboard setup wizard: creates the
 * quarantine role and log channels a fresh guild needs and flips Anti-Nuke/Join
 * Gate on, reusing the same config write path (`ConfigUtility.setConfig`) as
 * every other dashboard mutation rather than writing to Postgres directly.
 * Idempotent — re-running it on an already-configured guild reuses what's
 * there instead of duplicating roles/channels or re-flipping settings that
 * are already on.
 */
export async function runGuildSetup(
  guild: Guild,
  actorId: string | undefined,
): Promise<GuildSetupRunResult> {
  const config = getUtility("config");

  const existingQuarantineRoleId = await container.db.config.getModuleConfig(
    guild.id,
    "mod",
    "quarantine_role_id",
  );
  let quarantineRole =
    typeof existingQuarantineRoleId === "string"
      ? guild.roles.cache.get(existingQuarantineRoleId)
      : undefined;
  let quarantineRoleCreated = false;
  if (!quarantineRole) {
    quarantineRole = await guild.roles.create({
      name: "Quarantined",
      permissions: [],
      reason: "Dashboard setup wizard: quarantine role",
    });
    await config.setConfig(
      guild.id,
      "mod",
      "quarantine_role_id",
      quarantineRole.id,
      actorId,
    );
    quarantineRoleCreated = true;
  }

  const existingSecurityLogId = await container.db.config.getModuleConfig(
    guild.id,
    "security",
    "log_channel_id",
  );
  let logsChannel =
    typeof existingSecurityLogId === "string"
      ? guild.channels.cache.get(existingSecurityLogId)
      : undefined;
  let logsChannelCreated = false;
  if (!logsChannel) {
    logsChannel = await guild.channels.create({
      name: "logs",
      type: ChannelType.GuildText,
      reason: "Dashboard setup wizard: security log channel",
    });
    await config.setConfig(
      guild.id,
      "security",
      "log_channel_id",
      logsChannel.id,
      actorId,
    );
    logsChannelCreated = true;
  }

  const existingModLogId = await container.db.config.getModuleConfig(
    guild.id,
    "mod",
    "log_channel_id",
  );
  let modLogsChannel =
    typeof existingModLogId === "string"
      ? guild.channels.cache.get(existingModLogId)
      : undefined;
  let modLogsChannelCreated = false;
  if (!modLogsChannel) {
    modLogsChannel = await guild.channels.create({
      name: "modlogs",
      type: ChannelType.GuildText,
      reason: "Dashboard setup wizard: mod log channel",
    });
    await config.setConfig(
      guild.id,
      "mod",
      "log_channel_id",
      modLogsChannel.id,
      actorId,
    );
    modLogsChannelCreated = true;
  }

  const antinukeAlreadyEnabled =
    (await container.db.config.getModuleConfig(
      guild.id,
      "security",
      "antinuke_enabled",
    )) === true;
  if (!antinukeAlreadyEnabled) {
    await config.setConfig(
      guild.id,
      "security",
      "antinuke_enabled",
      "true",
      actorId,
    );
  }

  const joingateAlreadyEnabled =
    (await container.db.config.getModuleConfig(
      guild.id,
      "security",
      "joingate_enabled",
    )) === true;
  if (!joingateAlreadyEnabled) {
    await config.setConfig(
      guild.id,
      "security",
      "joingate_enabled",
      "true",
      actorId,
    );
  }

  return {
    quarantineRole: {
      id: quarantineRole.id,
      name: quarantineRole.name,
      created: quarantineRoleCreated,
    },
    logsChannel: {
      id: logsChannel.id,
      name: logsChannel.name,
      created: logsChannelCreated,
    },
    modLogsChannel: {
      id: modLogsChannel.id,
      name: modLogsChannel.name,
      created: modLogsChannelCreated,
    },
    antinukeEnabled: true,
    joingateEnabled: true,
  };
}

export const ModuleToggleSchema = s.object({
  moduleName: s.string().lengthGreaterThanOrEqual(1),
  enabled: s.boolean(),
});

export const ConfigSetSchema = s.object({
  moduleName: s.string().lengthGreaterThanOrEqual(1),
  key: s.string().lengthGreaterThanOrEqual(1),
  value: s.any(),
});

export const GuildSettingsSchema = s.object({
  prefix: s.string().lengthLessThanOrEqual(5).nullable().optional(),
  muteRoleId: SnowflakeSchema.nullable().optional(),
  locale: s.string().optional(),
  timezone: s.string().optional(),
});

export const PermitCreateSchema = s.object({
  name: s.string().lengthGreaterThanOrEqual(1).lengthLessThanOrEqual(64),
  kind: s.enum(["enforced", "custom"] as const),
  nodes: s.array(s.string().lengthGreaterThanOrEqual(1)).lengthGreaterThanOrEqual(1),
});

export const PermitUpdateSchema = s.object({
  permitId: s.number().int(),
  name: s.string().lengthGreaterThanOrEqual(1).lengthLessThanOrEqual(64).optional(),
  nodes: s.array(s.string().lengthGreaterThanOrEqual(1)).lengthGreaterThanOrEqual(1).optional(),
});

export const PermitDeleteSchema = s.object({
  permitId: s.number().int(),
});

export const PermitAssignSchema = s.object({
  permitId: s.number().int(),
  targetType: s.enum(["role", "user"] as const),
  targetId: SnowflakeSchema,
});

export const MAX_CASES_PAGE_SIZE = 100;

export const CasesListSchema = s.object({
  action: s.string().lengthGreaterThanOrEqual(1).lengthLessThanOrEqual(32).optional(),
  userId: SnowflakeSchema.optional(),
  moderatorId: SnowflakeSchema.optional(),
  page: s.number().int().greaterThanOrEqual(1).optional(),
  pageSize: s
    .number()
    .int()
    .greaterThanOrEqual(1)
    .lessThanOrEqual(MAX_CASES_PAGE_SIZE)
    .optional(),
});

export const CaseRevokeSchema = s.object({
  caseNumber: s.number().int().greaterThanOrEqual(1),
});

export const WarnThresholdSetSchema = s.object({
  warnCount: s.number().int().greaterThanOrEqual(1),
  action: s.enum(WARN_THRESHOLD_ACTIONS).nullable(),
  duration: s.string().lengthLessThanOrEqual(32).nullable().optional(),
});

export const MAX_PAGE_SIZE = 100;
export const PageSchema = s.number().int().greaterThanOrEqual(1).optional();
export const PageSizeSchema = s
  .number()
  .int()
  .greaterThanOrEqual(1)
  .lessThanOrEqual(MAX_PAGE_SIZE)
  .optional();
export const ModuleNameSchema = s
  .string()
  .lengthGreaterThanOrEqual(1)
  .lengthLessThanOrEqual(64);
export const ConfigKeySchema = s
  .string()
  .lengthGreaterThanOrEqual(1)
  .lengthLessThanOrEqual(64);

export const PanicSetSchema = s.object({
  active: s.boolean(),
  channelIds: s.array(SnowflakeSchema).optional(),
});

export const VerificationPanelSetSchema = s.object({
  channelId: SnowflakeSchema,
  messageId: SnowflakeSchema,
});

export const TempVcGeneratorSetSchema = s.object({
  channelId: SnowflakeSchema,
  name: s.string().lengthGreaterThanOrEqual(1).lengthLessThanOrEqual(100).nullable(),
  limit: s.number().int().greaterThanOrEqual(0).lessThanOrEqual(99).optional(),
});

export const GuildSummariesSchema = s.object({
  guildIds: s.array(SnowflakeSchema).lengthGreaterThanOrEqual(1),
});

export const AuditListSchema = s.object({
  userId: SnowflakeSchema.optional(),
  action: s.string().lengthGreaterThanOrEqual(1).lengthLessThanOrEqual(128).optional(),
  platform: s.enum(["discord", "web"] as const).optional(),
  page: PageSchema,
  pageSize: PageSizeSchema,
});

export const ConfigHistoryListSchema = s.object({
  moduleName: ModuleNameSchema.optional(),
  key: ConfigKeySchema.optional(),
  actorId: SnowflakeSchema.optional(),
  page: PageSchema,
  pageSize: PageSizeSchema,
});

export const ConfigHistoryRollbackSchema = s.object({
  entryId: s.string().lengthGreaterThanOrEqual(1).lengthLessThanOrEqual(64),
});

export const OverridesListSchema = s.object({
  moduleName: ModuleNameSchema.optional(),
});

export const OverrideSetSchema = s.object({
  moduleName: ModuleNameSchema,
  key: ConfigKeySchema,
  modelType: s.enum(["channel", "role", "user", "category"] as const),
  modelId: SnowflakeSchema,
  value: s.any(),
});

export const BlocklistListSchema = s.object({
  page: PageSchema,
  pageSize: PageSizeSchema,
});

export const BlocklistAddSchema = s.object({
  userId: SnowflakeSchema,
  reason: s.string().lengthLessThanOrEqual(500).optional(),
});

export const BlocklistRemoveSchema = s.object({
  userId: SnowflakeSchema,
});

export const ModNoteListSchema = s.object({
  userId: SnowflakeSchema,
});

export const ModNoteAddSchema = s.object({
  userId: SnowflakeSchema,
  message: s.string().lengthGreaterThanOrEqual(1).lengthLessThanOrEqual(1000),
});

export const ModNoteRemoveSchema = s.object({
  id: s.number().int().greaterThanOrEqual(1),
});

// Only ban/timeout cases are appealable - matches BanAction/MuteAction, the
// only two call sites that ever DM an appeal link.
export const APPEALABLE_CASE_ACTIONS = new Set(["ban", "mute"]);

export const AppealVerifySchema = s.object({
  caseId: s.number().int().greaterThanOrEqual(1),
  token: s.string().lengthGreaterThanOrEqual(1),
});

export const AppealSubmitSchema = s.object({
  caseId: s.number().int().greaterThanOrEqual(1),
  token: s.string().lengthGreaterThanOrEqual(1),
  message: s.string().lengthGreaterThanOrEqual(1).lengthLessThanOrEqual(2000),
});

export const AppealsListSchema = s.object({
  status: s.enum(APPEAL_STATUSES).optional(),
  page: PageSchema,
  pageSize: PageSizeSchema,
});

export const AppealReviewSchema = s.object({
  id: s.number().int().greaterThanOrEqual(1),
  status: s.enum(APPEAL_REVIEW_STATUSES),
});

export const IgnoredChannelSchema = s.object({
  channelId: SnowflakeSchema.nullable(),
});

export const ModuleDataListSchema = s.object({
  moduleName: ModuleNameSchema.optional(),
  targetId: s.string().lengthGreaterThanOrEqual(1).lengthLessThanOrEqual(191).optional(),
  key: ConfigKeySchema.optional(),
  page: PageSchema,
  pageSize: PageSizeSchema,
});

export const BackupRestoreSchema = s.object({
  backupId: s.number().int().optional(),
});

export type AppealTokenResolution =
  | { ok: false; reason: string }
  | { ok: true; moderationCase: ModerationCase; userId: string };

export async function resolveAppealToken(
  guildId: string,
  caseId: number,
  token: string,
): Promise<AppealTokenResolution> {
  const payload = verifyAppealToken(token);
  if (!payload || payload.guildId !== guildId || payload.caseId !== caseId) {
    return { ok: false, reason: "This appeal link is invalid or has expired." };
  }

  const moderationCase = await container.db.moderation.getModerationCaseById(caseId);
  if (
    !moderationCase ||
    moderationCase.guildId !== guildId ||
    moderationCase.userId !== payload.userId
  ) {
    return { ok: false, reason: "This appeal link is invalid or has expired." };
  }
  if (!APPEALABLE_CASE_ACTIONS.has(moderationCase.action)) {
    return { ok: false, reason: "This case can't be appealed." };
  }

  return { ok: true, moderationCase, userId: payload.userId };
}

export function paginate(filter: { page?: number; pageSize?: number }) {
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 25;
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function toRawConfigValue(value: unknown): string {
  if (Array.isArray(value)) {
    const bad = value.find((entry) => !isPrimitiveConfigValue(entry));
    if (bad !== undefined) {
      throw new TypeError(
        `Unsupported config list entry of type ${typeof bad}; expected string, number or boolean.`,
      );
    }
    return value.map((entry) => String(entry)).join(",");
  }
  if (!isPrimitiveConfigValue(value)) {
    throw new TypeError(
      `Unsupported config value of type ${value === null ? "null" : typeof value}; expected string, number or boolean.`,
    );
  }
  return String(value);
}

export function isPrimitiveConfigValue(value: unknown): boolean {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}
