import type { Container } from "#src/lib/Services.js";
import { logToChannel } from "#src/lib/api/moderation/ModLog.js";
import type { User } from "discord.js";

export interface CaseTypeDef {
  name: string;
  emoji?: string;
  auditReason?: string;
  defaultEnabled?: boolean;
}

export interface ResolvedCaseType {
  name: string;
  enabled: boolean;
  channelId: string | null;
  emoji: string | null;
}

const registry = new Map<string, CaseTypeDef>();

export function registerCaseTypes(...defs: CaseTypeDef[]): void {
  for (const def of defs) {
    registry.set(def.name.toLowerCase(), def);
  }
}

export function registeredCaseType(name: string): CaseTypeDef | undefined {
  return registry.get(name.toLowerCase());
}

export async function resolveCaseType(
  services: Container,
  guildId: string,
  name: string,
): Promise<ResolvedCaseType> {
  const def = registeredCaseType(name);
  const setting = await services.db.moderation.findCaseTypeSetting(
    guildId,
    name.toLowerCase(),
  );
  return {
    name: name.toLowerCase(),
    enabled: setting?.enabled ?? def?.defaultEnabled ?? true,
    channelId: setting?.channelId ?? null,
    emoji: setting?.emoji ?? def?.emoji ?? null,
  };
}

export async function setCaseType(
  services: Container,
  guildId: string,
  name: string,
  patch: { enabled?: boolean; channelId?: string | null; emoji?: string | null },
  actorId?: string,
): Promise<ResolvedCaseType> {
  await services.db.ensureGuild(guildId);
  const key = name.toLowerCase();
  await services.db.moderation.upsertCaseTypeSetting(guildId, key, patch);
  if (actorId) {
    await services.db.configHistory
      ?.logConfigChange({
        guildId,
        moduleName: "mod",
        key: `casetype:${key}`,
        oldValue: null,
        newValue: patch,
        actorId,
      })
      .catch(() => undefined);
  }
  return resolveCaseType(services, guildId, key);
}

export async function fileCase(
  services: Container,
  input: {
    guildId: string;
    type: string;
    userId: string;
    moderatorId: string;
    reason?: string;
    durationSeconds?: number;
    expiresAt?: Date;
    actor: User;
    color: number;
  },
): Promise<{ caseNumber: number; posted: boolean }> {
  const resolved = await resolveCaseType(services, input.guildId, input.type);
  if (!resolved.enabled) {
    return { caseNumber: 0, posted: false };
  }
  const knownActions = [
    "ban",
    "unban",
    "kick",
    "mute",
    "unmute",
    "softban",
    "voice_mute",
    "unvoice_mute",
    "warn",
    "quarantine",
    "unquarantine",
    "antinuke_alert",
  ] as const;
  const action = (
    knownActions as readonly string[]
  ).includes(resolved.name)
    ? (resolved.name as (typeof knownActions)[number])
    : "warn";
  const created = await services.db.moderation.createModerationCase({
    guildId: input.guildId,
    userId: input.userId,
    moderatorId: input.moderatorId,
    action,
    reason: input.reason,
    durationSeconds: input.durationSeconds,
    expiresAt: input.expiresAt,
    ...(action === resolved.name ? {} : { customType: resolved.name }),
  });
  await logToChannel(
    services,
    input.guildId,
    resolved.name,
    input.color,
    input.userId,
    input.actor,
    input.reason ?? "No reason provided.",
    created.caseNumber,
    "mod",
    resolved.channelId ? { channelId: resolved.channelId } : undefined,
  );
  return { caseNumber: created.caseNumber, posted: true };
}
