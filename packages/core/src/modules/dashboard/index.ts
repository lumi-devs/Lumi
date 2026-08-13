import { Module, DefineModule } from "#lib/module-system/Module.js";
import { container } from "@sapphire/framework";
import { registerRpcHandler, rpcHandlers } from "#lib/rpc/dispatch.js";
import {
  APPEAL_REVIEW_STATUSES,
  APPEAL_STATUSES,
  RPC_ACTIONS,
  WARN_THRESHOLD_ACTIONS,
  type GuildSetupRunResult,
} from "@lumi/contracts";
import { verifyAppealToken } from "#lib/appeals/token.js";
import type { ModerationCase } from "@prisma/client";
import { s, type BaseValidator } from "@sapphire/shapeshift";
import { getService, tryGetService } from "#lib/module-system/Service.js";
import { checkModulesEnabled } from "#lib/module-check.js";
// Routed through the shared threshold helpers rather than `db.moderation`
// so rules are validated the same way the bot's own editor validates them and
// the cached copy is invalidated across every shard.
import {
  removeThresholdRule,
  setThresholdRule,
} from "#utilities/thresholds.js";
import { ChannelType, type Guild } from "discord.js";

/** Channel types sensible to offer in a CHANNEL config picker by default (no threads, no categories). */
const PICKABLE_CHANNEL_TYPES = new Set<ChannelType>([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildVoice,
  ChannelType.GuildStageVoice,
  ChannelType.GuildForum,
  ChannelType.GuildMedia,
]);

const SnowflakeSchema = s.string().regex(/^\d{17,20}$/);

function requireGuildId(guildId: string | null | undefined): string {
  try {
    if (!guildId) throw new Error();
    SnowflakeSchema.parse(guildId);
    return guildId;
  } catch {
    throw new Error("guildId is required and must be a valid snowflake");
  }
}

function parsePayload<T>(schema: BaseValidator<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Bad payload: ${msg}`);
  }
}

// Re-checked live against the guild rather than trusted from the dashboard
// session, whose cached guild list can be up to `SESSION_TTL_MS` stale.
async function requireGuildManager(
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

function cachedGuild(guildId: string) {
  const guild = container.client.guilds.cache.get(guildId);
  if (!guild) throw new Error("Guild not found in bot cache");
  return guild;
}

/**
 * One-shot guided bootstrap for the dashboard setup wizard (Phase 7 of the
 * Wick-parity plan): creates the quarantine role and log channels a fresh
 * guild needs and flips Anti-Nuke/Join Gate on, reusing the same config
 * write path (`ConfigService.setConfig`) as every other dashboard mutation
 * rather than writing to Postgres directly. Idempotent — re-running it on
 * an already-configured guild reuses what's there instead of duplicating
 * roles/channels or re-flipping settings that are already on.
 */
async function runGuildSetup(
  guild: Guild,
  actorId: string | undefined,
): Promise<GuildSetupRunResult> {
  const config = getService("config");

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

const ModuleToggleSchema = s.object({
  moduleName: s.string().lengthGreaterThanOrEqual(1),
  enabled: s.boolean(),
});

const ConfigSetSchema = s.object({
  moduleName: s.string().lengthGreaterThanOrEqual(1),
  key: s.string().lengthGreaterThanOrEqual(1),
  value: s.any(),
});

const GuildSettingsSchema = s.object({
  prefix: s.string().lengthLessThanOrEqual(5).nullable().optional(),
  modRoleId: SnowflakeSchema.nullable().optional(),
  adminRoleId: SnowflakeSchema.nullable().optional(),
  modLogChannelId: SnowflakeSchema.nullable().optional(),
  muteRoleId: SnowflakeSchema.nullable().optional(),
  locale: s.string().optional(),
  timezone: s.string().optional(),
  noMentionSpamWindowMs: s.number().int().nullable().optional(),
  noMentionSpamLimit: s.number().int().nullable().optional(),
});

const PermitCreateSchema = s.object({
  name: s.string().lengthGreaterThanOrEqual(1).lengthLessThanOrEqual(64),
  kind: s.enum(["enforced", "custom"] as const),
  nodes: s.array(s.string().lengthGreaterThanOrEqual(1)).lengthGreaterThanOrEqual(1),
});

const PermitUpdateSchema = s.object({
  permitId: s.number().int(),
  name: s.string().lengthGreaterThanOrEqual(1).lengthLessThanOrEqual(64).optional(),
  nodes: s.array(s.string().lengthGreaterThanOrEqual(1)).lengthGreaterThanOrEqual(1).optional(),
});

const PermitDeleteSchema = s.object({
  permitId: s.number().int(),
});

const PermitAssignSchema = s.object({
  permitId: s.number().int(),
  targetType: s.enum(["role", "user"] as const),
  targetId: SnowflakeSchema,
});

const MAX_CASES_PAGE_SIZE = 100;

const CasesListSchema = s.object({
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

const CaseRevokeSchema = s.object({
  caseNumber: s.number().int().greaterThanOrEqual(1),
});

const WarnThresholdSetSchema = s.object({
  warnCount: s.number().int().greaterThanOrEqual(1),
  action: s.enum(WARN_THRESHOLD_ACTIONS).nullable(),
  duration: s.string().lengthLessThanOrEqual(32).nullable().optional(),
});

const MAX_PAGE_SIZE = 100;
const PageSchema = s.number().int().greaterThanOrEqual(1).optional();
const PageSizeSchema = s
  .number()
  .int()
  .greaterThanOrEqual(1)
  .lessThanOrEqual(MAX_PAGE_SIZE)
  .optional();
const ModuleNameSchema = s
  .string()
  .lengthGreaterThanOrEqual(1)
  .lengthLessThanOrEqual(64);
const ConfigKeySchema = s
  .string()
  .lengthGreaterThanOrEqual(1)
  .lengthLessThanOrEqual(64);

// No length cap here — `SecurityService.enterPanic` already slices the target
// list down to its own PANIC_CHANNEL_CAP.
const PanicSetSchema = s.object({
  active: s.boolean(),
  channelIds: s.array(SnowflakeSchema).optional(),
});

const VerificationPanelSetSchema = s.object({
  channelId: SnowflakeSchema,
  messageId: SnowflakeSchema,
});

const TempVcGeneratorSetSchema = s.object({
  channelId: SnowflakeSchema,
  name: s.string().lengthGreaterThanOrEqual(1).lengthLessThanOrEqual(100).nullable(),
  limit: s.number().int().greaterThanOrEqual(0).lessThanOrEqual(99).optional(),
});

const AuditListSchema = s.object({
  userId: SnowflakeSchema.optional(),
  action: s.string().lengthGreaterThanOrEqual(1).lengthLessThanOrEqual(128).optional(),
  platform: s.enum(["discord", "web"] as const).optional(),
  page: PageSchema,
  pageSize: PageSizeSchema,
});

const ConfigHistoryListSchema = s.object({
  moduleName: ModuleNameSchema.optional(),
  key: ConfigKeySchema.optional(),
  actorId: SnowflakeSchema.optional(),
  page: PageSchema,
  pageSize: PageSizeSchema,
});

const ConfigHistoryRollbackSchema = s.object({
  entryId: s.string().lengthGreaterThanOrEqual(1).lengthLessThanOrEqual(64),
});

const OverridesListSchema = s.object({
  moduleName: ModuleNameSchema.optional(),
});

const OverrideSetSchema = s.object({
  moduleName: ModuleNameSchema,
  key: ConfigKeySchema,
  modelType: s.enum(["channel", "role", "user", "category"] as const),
  modelId: SnowflakeSchema,
  value: s.any(),
});

const BlocklistListSchema = s.object({
  page: PageSchema,
  pageSize: PageSizeSchema,
});

const BlocklistAddSchema = s.object({
  userId: SnowflakeSchema,
  reason: s.string().lengthLessThanOrEqual(500).optional(),
});

const BlocklistRemoveSchema = s.object({
  userId: SnowflakeSchema,
});

const ModNoteListSchema = s.object({
  userId: SnowflakeSchema,
});

const ModNoteAddSchema = s.object({
  userId: SnowflakeSchema,
  message: s.string().lengthGreaterThanOrEqual(1).lengthLessThanOrEqual(1000),
});

const ModNoteRemoveSchema = s.object({
  id: s.number().int().greaterThanOrEqual(1),
});

// Only ban/timeout cases are appealable - matches BanAction/MuteAction, the
// only two call sites that ever DM an appeal link.
const APPEALABLE_CASE_ACTIONS = new Set(["ban", "mute"]);

const AppealVerifySchema = s.object({
  caseId: s.number().int().greaterThanOrEqual(1),
  token: s.string().lengthGreaterThanOrEqual(1),
});

const AppealSubmitSchema = s.object({
  caseId: s.number().int().greaterThanOrEqual(1),
  token: s.string().lengthGreaterThanOrEqual(1),
  message: s.string().lengthGreaterThanOrEqual(1).lengthLessThanOrEqual(2000),
});

const AppealsListSchema = s.object({
  status: s.enum(APPEAL_STATUSES).optional(),
  page: PageSchema,
  pageSize: PageSizeSchema,
});

const AppealReviewSchema = s.object({
  id: s.number().int().greaterThanOrEqual(1),
  status: s.enum(APPEAL_REVIEW_STATUSES),
});

const IgnoredChannelSchema = s.object({
  channelId: SnowflakeSchema.nullable(),
});

const ModuleDataListSchema = s.object({
  moduleName: ModuleNameSchema.optional(),
  targetId: s.string().lengthGreaterThanOrEqual(1).lengthLessThanOrEqual(191).optional(),
  key: ConfigKeySchema.optional(),
  page: PageSchema,
  pageSize: PageSizeSchema,
});

type AppealTokenResolution =
  | { ok: false; reason: string }
  | { ok: true; moderationCase: ModerationCase; userId: string };

// Shared by `guild.appeals.verify` and `guild.appeals.submit` - re-run in
// full on submission rather than trusting the earlier verify call, per the
// "don't trust client state between the two" requirement: a token that
// expired, or a case that was deleted, between page load and submit must
// fail here too.
async function resolveAppealToken(
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

function paginate(filter: { page?: number; pageSize?: number }) {
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 25;
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

// `ConfigService.setConfig` takes the raw string a Discord user would have
// typed, not an already-typed value.
function toRawConfigValue(value: unknown): string {
  return Array.isArray(value)
    ? value.map((entry) => String(entry)).join(",")
    : String(value);
}

@DefineModule({
  name: "dashboard",
  displayName: "Dashboard",
  emoji: "🖥️",
  version: "1.0.0",
  description:
    "Integrates the bot with the Lumi Web Dashboard. Provides RPC endpoints for management.",
})
export class DashboardModule extends Module {
  public override onLoad() {
    container.logger.info("[Dashboard] Initializing RPC handlers...");

    registerRpcHandler(RPC_ACTIONS.guildDashboardGet, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);

      const guild = container.client.guilds.cache.get(guildId);
      if (!guild) throw new Error("Guild not found in bot cache");

      const settings = await container.db.config.getGuildSettings(guildId);
      const moduleStore = container.stores.get("modules");
      const loadedModules = moduleStore.loaded();
      const moduleNames = loadedModules.map((m) => m.meta.name);

      const [enabledMap, allConfigsMap] = await Promise.all([
        checkModulesEnabled(guildId, moduleNames),
        container.db.config.getAllModuleConfigsForGuild(guildId),
      ]);

      const modules = loadedModules.map((m) => {
        const enabled = enabledMap.get(m.meta.name) ?? true;
        const guildModuleConfig = allConfigsMap.get(m.meta.name) ?? {};

        const config: Record<string, unknown> = {};
        if (m.meta.configFields) {
          for (const field of m.meta.configFields) {
            config[field.key] = guildModuleConfig[field.key] ?? field.default ?? null;
          }
        }

        return {
          name: m.meta.name,
          displayName: m.meta.displayName,
          emoji: m.meta.emoji,
          description: m.meta.description,
          version: m.meta.version,
          conflicts: m.meta.conflicts ?? [],
          dependencies: m.meta.dependencies ?? [],
          enabled,
          configFields: m.meta.configFields || [],
          config,
          isAddon: moduleStore.isAddonModule(m),
        };
      });

      const botRoleId = guild.members.me?.roles.highest.id;
      const roles = guild.roles.cache
        .filter((r) => r.id !== guild.id)
        .map((r) => ({
          id: r.id,
          name: r.name,
          color: r.color,
          position: r.position,
          permissions: r.permissions.bitfield.toString(),
          isBotRole: r.id === botRoleId,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const channels = guild.channels.cache
        .filter((c) => PICKABLE_CHANNEL_TYPES.has(c.type))
        .map((c) => ({ id: c.id, name: c.name, type: c.type }));

      const members = guild.members.cache
        .filter((m) => !m.user.bot)
        .map((m) => ({
          id: m.id,
          username: m.user.username,
          displayName: m.displayName,
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName))
        .slice(0, 200);

      return {
        name: guild.name,
        icon: guild.iconURL(),
        memberCount: guild.memberCount,
        settings,
        modules,
        roles,
        channels,
        members,
      };
    });

    registerRpcHandler(RPC_ACTIONS.guildModuleToggle, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const { moduleName, enabled } = parsePayload(
        ModuleToggleSchema,
        req.data,
      );

      if (moduleName === "core")
        throw new Error("Cannot disable the core module");

      await container.db.modules.setModuleGuildEnabled(
        guildId,
        moduleName,
        enabled,
      );
      return { success: true, enabled };
    });

    registerRpcHandler(RPC_ACTIONS.guildConfigSet, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const { moduleName, key, value } = parsePayload(
        ConfigSetSchema,
        req.data,
      );

      // Same path the in-Discord config panel uses: it validates the key
      // against the module's schema, coerces/validates the value, writes
      // audit history and fires the post-set hooks. Writing straight to
      // db.config here would let a dashboard caller store arbitrary
      // unvalidated JSON under any key.
      if (value === null || value === undefined || value === "") {
        await container.db.config.deleteModuleConfigKey(
          guildId,
          moduleName,
          key,
        );
        return { success: true, key, value: null };
      }

      const raw = toRawConfigValue(value);
      const { coerced } = await getService("config").setConfig(
        guildId,
        moduleName,
        key,
        raw,
        req.actorId,
      );
      return { success: true, key, value: coerced };
    });

    registerRpcHandler(RPC_ACTIONS.guildSetupRun, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const guild = container.client.guilds.cache.get(guildId);
      if (!guild) throw new Error("Guild not found in bot cache");

      return runGuildSetup(guild, req.actorId);
    });

    registerRpcHandler(RPC_ACTIONS.guildSettingsSet, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const data = parsePayload(GuildSettingsSchema, req.data);

      const tx = await container.db.transaction(guildId);
      try {
        tx.write(data);
        await tx.submit();
      } finally {
        tx.dispose();
      }
      const updated = await container.db.config.getGuildSettings(guildId);
      return { success: true, settings: updated };
    });

    registerRpcHandler(RPC_ACTIONS.guildPermitsList, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const permits = await getService("permissions").listPermits(guildId);
      return { permits };
    });

    registerRpcHandler(RPC_ACTIONS.guildPermitsCreate, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const { name, kind, nodes } = parsePayload(PermitCreateSchema, req.data);
      const permit = await getService("permissions").createPermit(
        guildId,
        name,
        kind,
        nodes,
      );
      return { success: true, permit };
    });

    registerRpcHandler(RPC_ACTIONS.guildPermitsUpdate, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const { permitId, name, nodes } = parsePayload(
        PermitUpdateSchema,
        req.data,
      );
      const perms = getService("permissions");
      if (name !== undefined) await perms.renamePermit(guildId, permitId, name);
      const permit = nodes !== undefined
        ? await perms.updatePermitNodes(guildId, permitId, nodes)
        : await perms.getPermit(guildId, permitId);
      return { success: true, permit };
    });

    registerRpcHandler(RPC_ACTIONS.guildPermitsDelete, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const { permitId } = parsePayload(PermitDeleteSchema, req.data);
      await getService("permissions").deletePermit(guildId, permitId);
      return { success: true };
    });

    registerRpcHandler(RPC_ACTIONS.guildPermitsAssign, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const { permitId, targetType, targetId } = parsePayload(
        PermitAssignSchema,
        req.data,
      );
      await getService("permissions").assignPermit(
        guildId,
        permitId,
        targetType,
        targetId,
      );
      return { success: true };
    });

    registerRpcHandler(RPC_ACTIONS.guildPermitsUnassign, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const { permitId, targetType, targetId } = parsePayload(
        PermitAssignSchema,
        req.data,
      );
      await getService("permissions").unassignPermit(
        guildId,
        permitId,
        targetType,
        targetId,
      );
      return { success: true };
    });

    registerRpcHandler(RPC_ACTIONS.guildCasesList, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const filter = parsePayload(CasesListSchema, req.data ?? {});

      const page = filter.page ?? 1;
      const pageSize = filter.pageSize ?? 25;
      const { cases, total } = await container.db.moderation.listCases(guildId, {
        action: filter.action,
        userId: filter.userId,
        moderatorId: filter.moderatorId,
        skip: (page - 1) * pageSize,
        take: pageSize,
      });

      return {
        cases: cases.map((c) => ({
          id: c.id,
          caseNumber: c.caseNumber,
          userId: c.userId,
          moderatorId: c.moderatorId,
          action: c.action,
          reason: c.reason,
          duration: c.duration,
          expiresAt: c.expiresAt?.toISOString() ?? null,
          active: c.active,
          createdAt: c.createdAt.toISOString(),
        })),
        total,
        page,
        pageSize,
      };
    });

    registerRpcHandler(RPC_ACTIONS.guildCasesRevoke, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const { caseNumber } = parsePayload(CaseRevokeSchema, req.data);

      const moderationCase = await container.db.moderation.getModerationCase(
        guildId,
        caseNumber,
      );
      if (!moderationCase) throw new Error(`Case #${caseNumber} not found`);
      if (!moderationCase.active) {
        throw new Error(`Case #${caseNumber} is already revoked`);
      }

      await container.db.moderation.liftModerationCase(moderationCase.id);
      return { success: true, caseNumber };
    });

    registerRpcHandler(RPC_ACTIONS.guildWarnThresholdsList, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const thresholds =
        await container.db.moderation.getWarnThresholds(guildId);

      return {
        thresholds: thresholds.map((t) => ({
          warnCount: t.warnCount,
          action: t.action,
          duration: t.duration,
        })),
      };
    });

    registerRpcHandler(RPC_ACTIONS.guildWarnThresholdsSet, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const { warnCount, action, duration } = parsePayload(
        WarnThresholdSetSchema,
        req.data,
      );

      if (action === null) {
        await removeThresholdRule(container, guildId, warnCount);
        return { success: true, warnCount, deleted: true };
      }

      await container.db.ensureGuild(guildId);
      await setThresholdRule(container, guildId, warnCount, action, duration);
      return { success: true, warnCount, deleted: false };
    });

    registerRpcHandler(RPC_ACTIONS.guildPanicGet, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const state = await container.db.security.getPanicState(guildId);

      if (!state) {
        return {
          active: false,
          actorId: null,
          invitesPaused: false,
          lockedChannelIds: [],
          startedAt: null,
        };
      }

      return {
        active: true,
        actorId: state.actorId,
        invitesPaused: state.invitesPaused,
        lockedChannelIds: Object.keys(
          (state.lockedChannels ?? {}) as Record<string, unknown>,
        ),
        startedAt: state.startedAt.toISOString(),
      };
    });

    // Panic mode is not a database flag: entering it rewrites `@everyone`
    // channel overwrites and pauses invites, and leaving it restores the
    // snapshot the service took. Both have to go through the security
    // service or the guild would be left half-locked.
    registerRpcHandler(RPC_ACTIONS.guildPanicSet, async (req) => {
      const guildId = requireGuildId(req.guildId);
      const actorId = await requireGuildManager(guildId, req.actorId);
      const { active, channelIds } = parsePayload(PanicSetSchema, req.data);

      const security = tryGetService("security");
      if (!security) throw new Error("The security module is not loaded");
      const guild = cachedGuild(guildId);

      if (!active) {
        const reverted = await security.revertPanic(guild);
        if (!reverted) throw new Error("Panic mode is not active");
        return { success: true, active: false, ...reverted };
      }

      const existing = await container.db.security.getPanicState(guildId);
      if (existing) throw new Error("Panic mode is already active");

      const result = await security.enterPanic(guild, actorId, channelIds ?? []);
      return { success: true, active: true, ...result };
    });

    registerRpcHandler(RPC_ACTIONS.guildVerificationPanelGet, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const panel = await container.db.security.getVerificationPanel(guildId);

      return {
        panel: panel
          ? {
              channelId: panel.channelId,
              messageId: panel.messageId,
              createdAt: panel.createdAt.toISOString(),
            }
          : null,
      };
    });

    registerRpcHandler(RPC_ACTIONS.guildVerificationPanelSet, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const { channelId, messageId } = parsePayload(
        VerificationPanelSetSchema,
        req.data,
      );

      await container.db.ensureGuild(guildId);
      const panel = await container.db.security.saveVerificationPanel({
        guildId,
        channelId,
        messageId,
      });
      return {
        success: true,
        panel: { channelId: panel.channelId, messageId: panel.messageId },
      };
    });

    registerRpcHandler(RPC_ACTIONS.guildVerificationPanelDelete, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const deleted =
        await container.db.security.deleteVerificationPanel(guildId);
      return { success: true, deleted };
    });

    // Not gated by requireGuildManager - any authenticated dashboard visitor
    // can complete their own "web" mode verification, same as anyone can
    // click the emoji-captcha panel. Grants only the caller's own role.
    registerRpcHandler(RPC_ACTIONS.guildVerificationWebComplete, async (req) => {
      const guildId = requireGuildId(req.guildId);
      const actorId = req.actorId;
      if (!actorId) throw new Error("actorId is required");
      SnowflakeSchema.parse(actorId);

      const security = tryGetService("security");
      if (!security) throw new Error("The security module is not loaded");

      const config = await security.loadVerificationConfig(guildId);
      if (!config.enabled || config.mode !== "web" || !config.verifiedRoleId) {
        throw new Error("Web verification is not enabled for this server");
      }

      const guild = cachedGuild(guildId);
      const granted = await security.grantVerified(guild, actorId);
      if (!granted) {
        throw new Error(
          "Couldn't grant the verified role - make sure you're a member of the server and try again.",
        );
      }
      return { success: true };
    });

    registerRpcHandler(RPC_ACTIONS.guildTempVcGeneratorsList, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const generators = await container.db.tempvc.listGenerators(guildId);

      return {
        generators: generators.map((g) => ({
          channelId: g.channelId,
          name: g.name,
          limit: g.limit,
        })),
      };
    });

    // Routed through the tempvc service rather than `db.tempvc` so its
    // in-memory generator registry is invalidated across every shard.
    registerRpcHandler(RPC_ACTIONS.guildTempVcGeneratorSet, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const { channelId, name, limit } = parsePayload(
        TempVcGeneratorSetSchema,
        req.data,
      );

      const tempvc = tryGetService("tempvc");
      if (!tempvc) throw new Error("The tempvc module is not loaded");

      if (name === null) {
        const deleted = await tempvc.removeGenerator(guildId, channelId);
        return { success: true, channelId, deleted };
      }

      await container.db.ensureGuild(guildId);
      await tempvc.addGenerator(guildId, channelId, {
        name,
        limit: limit ?? 0,
      });
      return { success: true, channelId, deleted: false };
    });

    registerRpcHandler(RPC_ACTIONS.guildTempVcRecordsList, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const records = await container.db.tempvc.listRecords(guildId);

      return {
        records: records.map((r) => ({
          channelId: r.channelId,
          ownerId: r.ownerId,
          generatorId: r.generatorId,
          name: r.name,
          number: r.number,
          locked: r.locked,
          hidden: r.hidden,
          createdAt: r.createdAt.toISOString(),
        })),
      };
    });

    registerRpcHandler(RPC_ACTIONS.guildAuditList, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const filter = parsePayload(AuditListSchema, req.data ?? {});
      const { page, pageSize, skip, take } = paginate(filter);

      const { entries, total } = await container.db.audit.listAuditLogs({
        guildId,
        userId: filter.userId,
        action: filter.action,
        platform: filter.platform,
        skip,
        take,
      });

      return {
        entries: entries.map((e) => ({
          id: e.id,
          guildId: e.guildId,
          userId: e.userId,
          action: e.action,
          platform: e.platform,
          details: e.details,
          createdAt: e.createdAt.toISOString(),
        })),
        total,
        page,
        pageSize,
      };
    });

    registerRpcHandler(RPC_ACTIONS.guildHistoryList, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const filter = parsePayload(ConfigHistoryListSchema, req.data ?? {});
      const { page, pageSize, skip, take } = paginate(filter);

      const { entries, total } =
        await container.db.configHistory.listGuildConfigHistory(guildId, {
          moduleName: filter.moduleName,
          key: filter.key,
          actorId: filter.actorId,
          skip,
          take,
        });

      return {
        entries: entries.map((e) => ({
          id: e.id,
          moduleName: e.moduleName,
          key: e.key,
          oldValue: e.oldValue,
          newValue: e.newValue,
          actorId: e.actorId,
          createdAt: e.createdAt.toISOString(),
        })),
        total,
        page,
        pageSize,
      };
    });

    registerRpcHandler(RPC_ACTIONS.guildHistoryRollback, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const { entryId } = parsePayload(ConfigHistoryRollbackSchema, req.data);

      const entry =
        await container.db.configHistory.getConfigHistoryEntry(entryId);
      if (!entry || entry.guildId !== guildId) {
        throw new Error(`History entry ${entryId} not found`);
      }

      if (entry.oldValue === null || entry.oldValue === undefined) {
        await container.db.config.deleteModuleConfigKey(
          guildId,
          entry.moduleName,
          entry.key,
        );
        return {
          success: true,
          moduleName: entry.moduleName,
          key: entry.key,
          value: null,
        };
      }

      const { coerced } = await getService("config").setConfig(
        guildId,
        entry.moduleName,
        entry.key,
        toRawConfigValue(entry.oldValue),
        req.actorId,
      );
      return {
        success: true,
        moduleName: entry.moduleName,
        key: entry.key,
        value: coerced,
      };
    });

    registerRpcHandler(RPC_ACTIONS.guildOverridesList, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const { moduleName } = parsePayload(OverridesListSchema, req.data ?? {});

      const overrides =
        await container.db.configOverrides.listGuildConfigOverrides(
          guildId,
          moduleName,
        );

      return {
        overrides: overrides.map((o) => ({
          id: o.id,
          moduleName: o.moduleName,
          key: o.key,
          modelType: o.modelType,
          modelId: o.modelId,
          value: o.value,
        })),
      };
    });

    registerRpcHandler(RPC_ACTIONS.guildOverridesSet, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const { moduleName, key, modelType, modelId, value } = parsePayload(
        OverrideSetSchema,
        req.data,
      );

      if (value === null || value === undefined) {
        const deleted = await container.db.configOverrides.deleteConfigOverride(
          { guildId, moduleName, key, modelType, modelId },
        );
        return { success: true, deleted };
      }

      await container.db.configOverrides.setConfigOverride({
        guildId,
        moduleName,
        key,
        modelType,
        modelId,
        value,
      });
      return { success: true, deleted: false };
    });

    registerRpcHandler(RPC_ACTIONS.guildBlocklistList, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const filter = parsePayload(BlocklistListSchema, req.data ?? {});
      const { page, pageSize, skip, take } = paginate(filter);

      const { entries, total } = await container.db.access.listBlocklist(
        guildId,
        { skip, take },
      );

      return {
        entries: entries.map((e) => ({
          id: e.id,
          userId: e.userId,
          reason: e.reason,
          blockedBy: e.blockedBy,
          createdAt: e.createdAt.toISOString(),
        })),
        total,
        page,
        pageSize,
      };
    });

    registerRpcHandler(RPC_ACTIONS.guildBlocklistAdd, async (req) => {
      const guildId = requireGuildId(req.guildId);
      const actorId = await requireGuildManager(guildId, req.actorId);
      const { userId, reason } = parsePayload(BlocklistAddSchema, req.data);

      if (await container.db.access.isUserBlocklisted(userId, guildId)) {
        throw new Error(`${userId} is already blocklisted in this server`);
      }

      await container.db.access.addBlocklistEntry(
        userId,
        actorId,
        reason,
        guildId,
      );
      return { success: true, userId };
    });

    registerRpcHandler(RPC_ACTIONS.guildBlocklistRemove, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const { userId } = parsePayload(BlocklistRemoveSchema, req.data);
      await container.db.access.removeBlocklistEntry(userId, guildId);
      return { success: true, userId };
    });

    registerRpcHandler(RPC_ACTIONS.guildModNotesList, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const { userId } = parsePayload(ModNoteListSchema, req.data);
      const notes = await container.db.modNotes.listForUser(guildId, userId);

      return {
        notes: notes.map((n) => ({
          id: n.id,
          userId: n.userId,
          authorId: n.authorId,
          message: n.message,
          createdAt: n.createdAt.toISOString(),
        })),
      };
    });

    registerRpcHandler(RPC_ACTIONS.guildModNotesAdd, async (req) => {
      const guildId = requireGuildId(req.guildId);
      const actorId = await requireGuildManager(guildId, req.actorId);
      const { userId, message } = parsePayload(ModNoteAddSchema, req.data);

      await container.db.ensureGuild(guildId);
      const note = await container.db.modNotes.create(
        guildId,
        userId,
        actorId,
        message,
      );
      return {
        success: true,
        note: {
          id: note.id,
          userId: note.userId,
          authorId: note.authorId,
          message: note.message,
          createdAt: note.createdAt.toISOString(),
        },
      };
    });

    registerRpcHandler(RPC_ACTIONS.guildModNotesRemove, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const { id } = parsePayload(ModNoteRemoveSchema, req.data);
      const deleted = await container.db.modNotes.delete(guildId, id);
      return { success: true, deleted };
    });

    // Public, unauthenticated: reachable by a punished user with no dashboard
    // access at all. Authorization is the signed token, not `actorId`/session.
    registerRpcHandler(RPC_ACTIONS.guildAppealsVerify, async (req) => {
      const guildId = requireGuildId(req.guildId);
      const { caseId, token } = parsePayload(AppealVerifySchema, req.data);

      const resolved = await resolveAppealToken(guildId, caseId, token);
      if (!resolved.ok) return { valid: false, reason: resolved.reason };

      const existing = await container.db.appeals.findByCaseId(caseId);
      return {
        valid: true,
        case: {
          caseNumber: resolved.moderationCase.caseNumber,
          action: resolved.moderationCase.action,
          reason: resolved.moderationCase.reason,
          createdAt: resolved.moderationCase.createdAt.toISOString(),
        },
        existingStatus: existing?.status ?? null,
      };
    });

    // Public, unauthenticated - see guildAppealsVerify above.
    registerRpcHandler(RPC_ACTIONS.guildAppealsSubmit, async (req) => {
      const guildId = requireGuildId(req.guildId);
      const { caseId, token, message } = parsePayload(
        AppealSubmitSchema,
        req.data,
      );

      const resolved = await resolveAppealToken(guildId, caseId, token);
      if (!resolved.ok) throw new Error(resolved.reason);

      const existing = await container.db.appeals.findByCaseId(caseId);
      if (existing) {
        throw new Error("An appeal has already been submitted for this case.");
      }

      await container.db.ensureGuild(guildId);
      const appeal = await container.db.appeals.create(
        guildId,
        resolved.userId,
        caseId,
        message,
      );
      return {
        success: true,
        appeal: {
          id: appeal.id,
          status: appeal.status,
          createdAt: appeal.createdAt.toISOString(),
        },
      };
    });

    registerRpcHandler(RPC_ACTIONS.guildAppealsList, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const filter = parsePayload(AppealsListSchema, req.data ?? {});
      const { page, pageSize, skip, take } = paginate(filter);

      const { appeals, total } = await container.db.appeals.listForGuild(
        guildId,
        { status: filter.status, skip, take },
      );
      const cases = await Promise.all(
        appeals.map((a) => container.db.moderation.getModerationCaseById(a.caseId)),
      );

      return {
        appeals: appeals.map((a, i) => ({
          id: a.id,
          guildId: a.guildId,
          userId: a.userId,
          caseId: a.caseId,
          caseNumber: cases[i]?.caseNumber ?? 0,
          action: cases[i]?.action ?? "unknown",
          status: a.status,
          message: a.message,
          reviewedBy: a.reviewedBy,
          reviewedAt: a.reviewedAt?.toISOString() ?? null,
          createdAt: a.createdAt.toISOString(),
        })),
        total,
        page,
        pageSize,
      };
    });

    registerRpcHandler(RPC_ACTIONS.guildAppealsReview, async (req) => {
      const guildId = requireGuildId(req.guildId);
      const actorId = await requireGuildManager(guildId, req.actorId);
      const { id, status } = parsePayload(AppealReviewSchema, req.data);

      const appeal = await container.db.appeals.review(
        guildId,
        id,
        status,
        actorId,
      );
      if (!appeal) throw new Error(`Appeal #${id} not found`);

      if (
        status === "denied_blacklisted" &&
        !(await container.db.access.isUserBlocklisted(appeal.userId, guildId))
      ) {
        await container.db.access.addBlocklistEntry(
          appeal.userId,
          actorId,
          "Appeal denied — blacklisted",
          guildId,
        );
      }

      return {
        success: true,
        appeal: {
          id: appeal.id,
          status: appeal.status,
          reviewedBy: appeal.reviewedBy,
          reviewedAt: appeal.reviewedAt?.toISOString() ?? null,
        },
      };
    });

    registerRpcHandler(RPC_ACTIONS.guildAfkList, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const entries = await container.db.afk.findForGuild(guildId);

      return {
        entries: entries.map((e) => ({
          userId: e.userId,
          reason: e.reason,
          since: e.since.toISOString(),
        })),
      };
    });

    registerRpcHandler(RPC_ACTIONS.guildIgnoredList, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const entries = await container.db.access.listIgnoreEntries(guildId);

      return {
        entries: entries.map((e) => ({
          id: e.id,
          channelId: e.channelId,
          createdAt: e.createdAt.toISOString(),
        })),
      };
    });

    registerRpcHandler(RPC_ACTIONS.guildIgnoredAdd, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const { channelId } = parsePayload(IgnoredChannelSchema, req.data);

      const existing = await container.db.access.listIgnoreEntries(guildId);
      if (existing.some((e) => e.channelId === channelId)) {
        throw new Error(
          channelId
            ? `<#${channelId}> is already ignored`
            : "This server is already ignored",
        );
      }

      await container.db.ensureGuild(guildId);
      await container.db.access.addIgnoreEntry(guildId, channelId);
      return { success: true, channelId };
    });

    registerRpcHandler(RPC_ACTIONS.guildIgnoredRemove, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const { channelId } = parsePayload(IgnoredChannelSchema, req.data);
      await container.db.access.removeIgnoreEntry(guildId, channelId);
      return { success: true, channelId };
    });

    registerRpcHandler(RPC_ACTIONS.guildModuleDataList, async (req) => {
      const guildId = requireGuildId(req.guildId);
      await requireGuildManager(guildId, req.actorId);
      const filter = parsePayload(ModuleDataListSchema, req.data ?? {});
      const { page, pageSize, skip, take } = paginate(filter);

      const { entries, total } =
        await container.db.guildKV.listGuildModuleData(guildId, {
          moduleName: filter.moduleName,
          targetId: filter.targetId,
          key: filter.key,
          skip,
          take,
        });

      return { entries, total, page, pageSize };
    });

    return super.onLoad();
  }

  public override onUnload() {
    container.logger.info("[Dashboard] Unloading RPC handlers...");
    rpcHandlers.delete(RPC_ACTIONS.guildDashboardGet);
    rpcHandlers.delete(RPC_ACTIONS.guildModuleToggle);
    rpcHandlers.delete(RPC_ACTIONS.guildConfigSet);
    rpcHandlers.delete(RPC_ACTIONS.guildSetupRun);
    rpcHandlers.delete(RPC_ACTIONS.guildSettingsSet);
    rpcHandlers.delete(RPC_ACTIONS.guildPermitsList);
    rpcHandlers.delete(RPC_ACTIONS.guildPermitsCreate);
    rpcHandlers.delete(RPC_ACTIONS.guildPermitsUpdate);
    rpcHandlers.delete(RPC_ACTIONS.guildPermitsDelete);
    rpcHandlers.delete(RPC_ACTIONS.guildPermitsAssign);
    rpcHandlers.delete(RPC_ACTIONS.guildPermitsUnassign);
    rpcHandlers.delete(RPC_ACTIONS.guildCasesList);
    rpcHandlers.delete(RPC_ACTIONS.guildCasesRevoke);
    rpcHandlers.delete(RPC_ACTIONS.guildWarnThresholdsList);
    rpcHandlers.delete(RPC_ACTIONS.guildWarnThresholdsSet);
    rpcHandlers.delete(RPC_ACTIONS.guildPanicGet);
    rpcHandlers.delete(RPC_ACTIONS.guildPanicSet);
    rpcHandlers.delete(RPC_ACTIONS.guildVerificationPanelGet);
    rpcHandlers.delete(RPC_ACTIONS.guildVerificationPanelSet);
    rpcHandlers.delete(RPC_ACTIONS.guildVerificationPanelDelete);
    rpcHandlers.delete(RPC_ACTIONS.guildVerificationWebComplete);
    rpcHandlers.delete(RPC_ACTIONS.guildTempVcGeneratorsList);
    rpcHandlers.delete(RPC_ACTIONS.guildTempVcGeneratorSet);
    rpcHandlers.delete(RPC_ACTIONS.guildTempVcRecordsList);
    rpcHandlers.delete(RPC_ACTIONS.guildAuditList);
    rpcHandlers.delete(RPC_ACTIONS.guildHistoryList);
    rpcHandlers.delete(RPC_ACTIONS.guildHistoryRollback);
    rpcHandlers.delete(RPC_ACTIONS.guildOverridesList);
    rpcHandlers.delete(RPC_ACTIONS.guildOverridesSet);
    rpcHandlers.delete(RPC_ACTIONS.guildBlocklistList);
    rpcHandlers.delete(RPC_ACTIONS.guildBlocklistAdd);
    rpcHandlers.delete(RPC_ACTIONS.guildBlocklistRemove);
    rpcHandlers.delete(RPC_ACTIONS.guildModNotesList);
    rpcHandlers.delete(RPC_ACTIONS.guildModNotesAdd);
    rpcHandlers.delete(RPC_ACTIONS.guildModNotesRemove);
    rpcHandlers.delete(RPC_ACTIONS.guildAppealsVerify);
    rpcHandlers.delete(RPC_ACTIONS.guildAppealsSubmit);
    rpcHandlers.delete(RPC_ACTIONS.guildAppealsList);
    rpcHandlers.delete(RPC_ACTIONS.guildAppealsReview);
    rpcHandlers.delete(RPC_ACTIONS.guildAfkList);
    rpcHandlers.delete(RPC_ACTIONS.guildIgnoredList);
    rpcHandlers.delete(RPC_ACTIONS.guildIgnoredAdd);
    rpcHandlers.delete(RPC_ACTIONS.guildIgnoredRemove);
    rpcHandlers.delete(RPC_ACTIONS.guildModuleDataList);
    return super.onUnload();
  }
}
