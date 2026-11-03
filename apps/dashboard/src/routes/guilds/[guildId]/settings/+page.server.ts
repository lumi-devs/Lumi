import { fail } from "@sveltejs/kit";
import { z } from "zod";
import { recordAudit } from "#lib/server/audit.js";
import { requireGuildForm, requireGuildId } from "#lib/server/auth.js";
import { readGuildSettings, setGuildSettings } from "#lib/server/settings.js";
import { checkbox, formString, parseInput } from "#lib/server/validation.js";
import type { Actions, PageServerLoad } from "./$types";

const OptionalSnowflake = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d{16,22}$/.test(value), {
    message: "Expected a Discord snowflake ID or an empty value.",
  })
  .transform((value) => (value === "" ? null : value));

const SettingsSchema = z.object({
  prefix: z
    .string()
    .trim()
    .min(1)
    .max(5)
    .refine((value) => !/\s/.test(value), {
      message: "The prefix cannot contain whitespace.",
    }),
  enforcePermits: z.boolean(),
  messageLogChannel: OptionalSnowflake,
  moderationLogChannel: OptionalSnowflake,
  securityLogChannel: OptionalSnowflake,
  auditLogChannel: OptionalSnowflake,
});

function logChannels(settings: Record<string, unknown>): {
  message: string | null;
  moderation: string | null;
  security: string | null;
  audit: string | null;
} {
  const raw = settings.logChannels;
  const value =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const read = (key: string): string | null =>
    typeof value[key] === "string" ? (value[key] as string) : null;
  return {
    message: read("message"),
    moderation: read("moderation"),
    security: read("security"),
    audit: read("audit"),
  };
}

export const load: PageServerLoad = async (event) => {
  const guildId = await requireGuildId(event);
  const settings = await readGuildSettings(guildId);
  const channels = logChannels(settings);
  return {
    settings: {
      prefix: typeof settings.prefix === "string" ? settings.prefix : ",",
      enforcePermits: Boolean(settings.enforcePermits),
      logChannels: channels,
    },
    settingsKeys: Object.keys(settings).sort(),
  };
};

export const actions: Actions = {
  save: async (event) => {
    const { guildId, userId, data } = await requireGuildForm(event);

    const parsed = parseInput(SettingsSchema, {
      prefix: formString(data, "prefix"),
      enforcePermits: checkbox(data, "enforcePermits"),
      messageLogChannel: formString(data, "messageLogChannel"),
      moderationLogChannel: formString(data, "moderationLogChannel"),
      securityLogChannel: formString(data, "securityLogChannel"),
      auditLogChannel: formString(data, "auditLogChannel"),
    });
    if (!parsed.ok) return fail(400, { error: parsed.message });

    const channels: Record<string, string> = {};
    if (parsed.data.messageLogChannel)
      channels.message = parsed.data.messageLogChannel;
    if (parsed.data.moderationLogChannel)
      channels.moderation = parsed.data.moderationLogChannel;
    if (parsed.data.securityLogChannel)
      channels.security = parsed.data.securityLogChannel;
    if (parsed.data.auditLogChannel)
      channels.audit = parsed.data.auditLogChannel;

    await setGuildSettings(guildId, {
      prefix: parsed.data.prefix,
      enforcePermits: parsed.data.enforcePermits,
      logChannels: channels,
    });
    await recordAudit({
      guildId,
      userId,
      action: "dashboard.settings.update",
      targetType: "guild_settings",
      changes: {
        prefix: parsed.data.prefix,
        enforcePermits: parsed.data.enforcePermits,
        logChannelCount: Object.keys(channels).length,
      },
    });
    return { success: "Server settings saved." };
  },
};
