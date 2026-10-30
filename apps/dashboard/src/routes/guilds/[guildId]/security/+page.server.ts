import type { PageServerLoad, Actions } from "./$types";
import { createHash, randomBytes } from "node:crypto";
import { fail } from "@sveltejs/kit";
import { z } from "zod";
import { requireGuildAccess } from "$lib/server/auth";
import { recordAudit } from "$lib/server/audit";
import { fetchGuildRoles, type DiscordRole } from "$lib/server/discord";
import { publicWebBaseUrl } from "$lib/server/env";
import { getPrisma } from "$lib/server/prisma";
import { getRedis } from "$lib/server/redis";
import { readGuildSettings, setGuildSetting } from "$lib/server/settings";
import {
  assertCsrf,
  checkbox,
  formString,
  IdSchema,
  OptionalIdSchema,
  parseInput,
  splitList,
} from "$lib/server/validation";

const NullableIdLoad = z.string().nullable().default(null);

const SecurityLoad = z.object({
  logChannelId: NullableIdLoad,
  quarantineRoleId: NullableIdLoad,
  trustedRoleIds: z.array(z.string()).default([]),
});

const PanicLoad = z.object({
  enabled: z.boolean().default(false),
  burstLimit: z.number().int().min(1).max(20).default(3),
  burstWindowSeconds: z.number().int().min(1).max(10).default(2),
  durationMinutes: z.number().int().min(1).max(1440).default(30),
  notifyOwners: z.boolean().default(true),
  lockModCommands: z.boolean().default(false),
});

const BackupsLoad = z.object({
  enabled: z.boolean().default(false),
  intervalHours: z.number().int().min(1).max(168).default(3),
  keepCount: z.number().int().min(1).max(50).default(10),
});

const VerificationLoad = z.object({
  enabled: z.boolean().default(false),
  verifiedRoleId: NullableIdLoad,
  pendingRoleId: NullableIdLoad,
  timeoutMinutes: z.number().int().min(1).max(1440).default(10),
  kickOnTimeout: z.boolean().default(false),
  mode: z.enum(["emoji", "none", "web"]).default("emoji"),
  target: z.enum(["everyone", "suspicious"]).default("everyone"),
});

const SecuritySave = z.object({
  logChannelId: OptionalIdSchema,
  quarantineRoleId: OptionalIdSchema,
  trustedRoleIds: z.array(IdSchema).max(100),
});

const PanicSave = z.object({
  enabled: z.boolean(),
  burstLimit: z.coerce.number().int().min(1).max(20),
  burstWindowSeconds: z.coerce.number().int().min(1).max(10),
  durationMinutes: z.coerce.number().int().min(1).max(1440),
  notifyOwners: z.boolean(),
  lockModCommands: z.boolean(),
});

const BackupsSave = z.object({
  enabled: z.boolean(),
  intervalHours: z.coerce.number().int().min(1).max(168),
  keepCount: z.coerce.number().int().min(1).max(50),
});

const VerificationSave = z.object({
  enabled: z.boolean(),
  verifiedRoleId: OptionalIdSchema,
  pendingRoleId: OptionalIdSchema,
  timeoutMinutes: z.coerce.number().int().min(1).max(1440),
  kickOnTimeout: z.boolean(),
  mode: z.enum(["emoji", "none", "web"]),
  target: z.enum(["everyone", "suspicious"]),
});

const PanicAction = z.object({
  minutes: z.coerce.number().int().min(1).max(1440),
  reason: z.string().trim().min(1).max(200),
  lockModCommands: z.boolean(),
});

const VerificationCreate = z.object({
  userId: IdSchema,
  minutes: z.coerce.number().int().min(5).max(1440),
});

const PanicStateSchema = z.object({
  until: z.number(),
  startedAt: z.number(),
  reason: z.string(),
  by: z.string(),
  lockModCommands: z.boolean().optional(),
});

function parseOr<T>(schema: z.ZodType<T>, value: unknown, fallback: T): T {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
}

function panicKey(guildId: string): string {
  return `lumi:security:panic:${guildId}`;
}

function moduleLockKey(guildId: string): string {
  return `lumi:lock:module:${guildId}:moderation-mod`;
}

async function currentPanic(guildId: string) {
  const raw = await getRedis().get(panicKey(guildId));
  if (!raw) return null;
  try {
    const parsed = PanicStateSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    if (parsed.data.until <= Date.now()) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export const load: PageServerLoad = async (event) => {
  const guildId = event.params.guildId ?? "";
  await requireGuildAccess(event, guildId);
  const settings = await readGuildSettings(guildId);
  const prisma = getPrisma();

  const [backups, tokens, panic] = await Promise.all([
    prisma.securityBackup.findMany({
      where: { guildId },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: { id: true, reason: true, createdAt: true },
    }),
    prisma.verificationToken.findMany({
      where: { guildId },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        usedAt: true,
        createdAt: true,
      },
    }),
    currentPanic(guildId),
  ]);

  let roles: DiscordRole[] = [];
  let botRolesAvailable = false;
  try {
    roles = await fetchGuildRoles(guildId);
    botRolesAvailable = true;
  } catch (error) {
    console.warn("[dashboard] could not load guild roles", error);
  }

  return {
    security: parseOr(SecurityLoad, settings.security, {
      logChannelId: null,
      quarantineRoleId: null,
      trustedRoleIds: [],
    }),
    panicConfig: parseOr(PanicLoad, settings["security-panic"], {
      enabled: false,
      burstLimit: 3,
      burstWindowSeconds: 2,
      durationMinutes: 30,
      notifyOwners: true,
      lockModCommands: false,
    }),
    backupsConfig: parseOr(BackupsLoad, settings["security-backups"], {
      enabled: false,
      intervalHours: 3,
      keepCount: 10,
    }),
    verification: parseOr(VerificationLoad, settings["security-verification"], {
      enabled: false,
      verifiedRoleId: null,
      pendingRoleId: null,
      timeoutMinutes: 10,
      kickOnTimeout: false,
      mode: "emoji",
      target: "everyone",
    }),
    panic: panic
      ? {
          ...panic,
          startedAtIso: new Date(panic.startedAt).toISOString(),
          untilIso: new Date(panic.until).toISOString(),
        }
      : null,
    backups: backups.map((backup) => ({
      ...backup,
      createdAt: backup.createdAt.toISOString(),
    })),
    tokens: tokens.map((token) => ({
      ...token,
      expiresAt: token.expiresAt.toISOString(),
      usedAt: token.usedAt?.toISOString() ?? null,
      createdAt: token.createdAt.toISOString(),
      expired: token.expiresAt.getTime() <= Date.now(),
    })),
    roles,
    botRolesAvailable,
    webBaseUrl: publicWebBaseUrl(),
  };
};

export const actions: Actions = {
  saveSecurity: async (event) => {
    const guildId = event.params.guildId ?? "";
    await requireGuildAccess(event, guildId);
    const data = await event.request.formData();
    const userId = assertCsrf(event, data);

    const parsed = parseInput(SecuritySave, {
      logChannelId: formString(data, "logChannelId"),
      quarantineRoleId: formString(data, "quarantineRoleId"),
      trustedRoleIds: splitList(formString(data, "trustedRoleIds")),
    });
    if (!parsed.ok) return fail(400, { error: parsed.message });

    await setGuildSetting(guildId, "security", parsed.data);
    await recordAudit({
      guildId,
      userId,
      action: "dashboard.security.config",
      targetType: "guild_settings",
      changes: { key: "security" },
    });
    return { success: "Security settings saved." };
  },

  savePanic: async (event) => {
    const guildId = event.params.guildId ?? "";
    await requireGuildAccess(event, guildId);
    const data = await event.request.formData();
    const userId = assertCsrf(event, data);

    const parsed = parseInput(PanicSave, {
      enabled: checkbox(data, "enabled"),
      burstLimit: formString(data, "burstLimit", "3"),
      burstWindowSeconds: formString(data, "burstWindowSeconds", "2"),
      durationMinutes: formString(data, "durationMinutes", "30"),
      notifyOwners: checkbox(data, "notifyOwners"),
      lockModCommands: checkbox(data, "lockModCommands"),
    });
    if (!parsed.ok) return fail(400, { error: parsed.message });

    await setGuildSetting(guildId, "security-panic", parsed.data);
    await recordAudit({
      guildId,
      userId,
      action: "dashboard.security.panic_config",
      targetType: "guild_settings",
      changes: { key: "security-panic" },
    });
    return { success: "Panic mode settings saved." };
  },

  saveBackups: async (event) => {
    const guildId = event.params.guildId ?? "";
    await requireGuildAccess(event, guildId);
    const data = await event.request.formData();
    const userId = assertCsrf(event, data);

    const parsed = parseInput(BackupsSave, {
      enabled: checkbox(data, "enabled"),
      intervalHours: formString(data, "intervalHours", "3"),
      keepCount: formString(data, "keepCount", "10"),
    });
    if (!parsed.ok) return fail(400, { error: parsed.message });

    await setGuildSetting(guildId, "security-backups", parsed.data);
    await recordAudit({
      guildId,
      userId,
      action: "dashboard.security.backups_config",
      targetType: "guild_settings",
      changes: { key: "security-backups" },
    });
    return { success: "Backup settings saved." };
  },

  saveVerification: async (event) => {
    const guildId = event.params.guildId ?? "";
    await requireGuildAccess(event, guildId);
    const data = await event.request.formData();
    const userId = assertCsrf(event, data);

    const parsed = parseInput(VerificationSave, {
      enabled: checkbox(data, "enabled"),
      verifiedRoleId: formString(data, "verifiedRoleId"),
      pendingRoleId: formString(data, "pendingRoleId"),
      timeoutMinutes: formString(data, "timeoutMinutes", "10"),
      kickOnTimeout: checkbox(data, "kickOnTimeout"),
      mode: formString(data, "mode", "emoji"),
      target: formString(data, "target", "everyone"),
    });
    if (!parsed.ok) return fail(400, { error: parsed.message });

    await setGuildSetting(guildId, "security-verification", parsed.data);
    await recordAudit({
      guildId,
      userId,
      action: "dashboard.security.verification_config",
      targetType: "guild_settings",
      changes: { key: "security-verification" },
    });
    return { success: "Verification settings saved." };
  },

  startPanic: async (event) => {
    const guildId = event.params.guildId ?? "";
    await requireGuildAccess(event, guildId);
    const data = await event.request.formData();
    const userId = assertCsrf(event, data);

    const parsed = parseInput(PanicAction, {
      minutes: formString(data, "minutes", "30"),
      reason: formString(data, "reason"),
      lockModCommands: checkbox(data, "lockModCommands"),
    });
    if (!parsed.ok) return fail(400, { error: parsed.message });

    const now = Date.now();
    const until = now + parsed.data.minutes * 60_000;
    const state = {
      until,
      startedAt: now,
      reason: parsed.data.reason,
      by: userId,
      lockModCommands: parsed.data.lockModCommands,
    };
    const ttl = Math.max(60, Math.ceil((until - now) / 1000) + 300);
    await getRedis().set(panicKey(guildId), JSON.stringify(state), "EX", ttl);
    if (parsed.data.lockModCommands) {
      await getRedis().set(moduleLockKey(guildId), "1", "EX", ttl);
    }

    await recordAudit({
      guildId,
      userId,
      action: "dashboard.security.panic.start",
      targetType: "guild",
      changes: {
        minutes: parsed.data.minutes,
        reason: parsed.data.reason,
      },
    });
    return { success: "Panic mode started." };
  },

  endPanic: async (event) => {
    const guildId = event.params.guildId ?? "";
    await requireGuildAccess(event, guildId);
    const data = await event.request.formData();
    const userId = assertCsrf(event, data);

    await getRedis().del(panicKey(guildId));
    await getRedis().del(moduleLockKey(guildId));
    await recordAudit({
      guildId,
      userId,
      action: "dashboard.security.panic.end",
      targetType: "guild",
    });
    return { success: "Panic mode ended." };
  },

  createVerification: async (event) => {
    const guildId = event.params.guildId ?? "";
    await requireGuildAccess(event, guildId);
    const data = await event.request.formData();
    const userId = assertCsrf(event, data);

    const parsed = parseInput(VerificationCreate, {
      userId: formString(data, "userId"),
      minutes: formString(data, "minutes", "30"),
    });
    if (!parsed.ok) return fail(400, { error: parsed.message });

    const settings = await readGuildSettings(guildId);
    const verification = parseOr(
      VerificationLoad,
      settings["security-verification"],
      {
        enabled: false,
        verifiedRoleId: null,
        pendingRoleId: null,
        timeoutMinutes: 10,
        kickOnTimeout: false,
        mode: "emoji",
        target: "everyone",
      },
    );
    if (!verification.verifiedRoleId) {
      return fail(400, {
        error:
          "Set and save a verified role before creating a verification link.",
      });
    }

    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + parsed.data.minutes * 60_000);

    const created = await getPrisma().verificationToken.create({
      data: {
        guildId,
        userId: parsed.data.userId,
        tokenHash,
        expiresAt,
      },
    });
    await recordAudit({
      guildId,
      userId,
      action: "dashboard.security.verification.create",
      targetId: created.id,
      targetType: "verification_token",
      changes: { targetUserId: parsed.data.userId },
    });

    return {
      success: "Verification link created. Copy it now; it is shown once.",
      verificationLink: `${publicWebBaseUrl()}/verify/${token}`,
    };
  },

  revokeVerification: async (event) => {
    const guildId = event.params.guildId ?? "";
    await requireGuildAccess(event, guildId);
    const data = await event.request.formData();
    const userId = assertCsrf(event, data);

    const id = formString(data, "id");
    const removed = await getPrisma().verificationToken.deleteMany({
      where: { id, guildId },
    });
    if (removed.count === 0) {
      return fail(404, { error: "Verification token not found." });
    }
    await recordAudit({
      guildId,
      userId,
      action: "dashboard.security.verification.revoke",
      targetId: id,
      targetType: "verification_token",
    });
    return { success: "Verification token revoked." };
  },

  deleteBackup: async (event) => {
    const guildId = event.params.guildId ?? "";
    await requireGuildAccess(event, guildId);
    const data = await event.request.formData();
    const userId = assertCsrf(event, data);

    const id = formString(data, "id");
    const removed = await getPrisma().securityBackup.deleteMany({
      where: { id, guildId },
    });
    if (removed.count === 0) {
      return fail(404, { error: "Backup not found." });
    }
    await recordAudit({
      guildId,
      userId,
      action: "dashboard.security.backup.delete",
      targetId: id,
      targetType: "security_backup",
    });
    return { success: "Backup deleted." };
  },
};
