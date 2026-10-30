import type { PageServerLoad, Actions } from "./$types";
import { fail } from "@sveltejs/kit";
import { z } from "zod";
import { requireGuildAccess } from "$lib/server/auth";
import { recordAudit } from "$lib/server/audit";
import { readGuildSettings, setGuildSettings } from "$lib/server/settings";
import {
  assertCsrf,
  checkbox,
  formString,
  parseInput,
} from "$lib/server/validation";

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
  locale: z
    .string()
    .trim()
    .min(2)
    .max(24)
    .regex(/^[a-zA-Z]{2,3}(?:[-_][a-zA-Z0-9]{2,8})*$/, {
      message: "Use a locale such as en-US.",
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
  const guildId = event.params.guildId ?? "";
  await requireGuildAccess(event, guildId);
  const settings = await readGuildSettings(guildId);
  const channels = logChannels(settings);
  return {
    settings: {
      prefix: typeof settings.prefix === "string" ? settings.prefix : ",",
      locale: typeof settings.locale === "string" ? settings.locale : "en-US",
      enforcePermits: Boolean(settings.enforcePermits),
      logChannels: channels,
    },
    settingsKeys: Object.keys(settings).sort(),
  };
};

export const actions: Actions = {
  save: async (event) => {
    const guildId = event.params.guildId ?? "";
    await requireGuildAccess(event, guildId);
    const data = await event.request.formData();
    const userId = assertCsrf(event, data);

    const parsed = parseInput(SettingsSchema, {
      prefix: formString(data, "prefix"),
      locale: formString(data, "locale", "en-US"),
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
      locale: parsed.data.locale,
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
        locale: parsed.data.locale,
        enforcePermits: parsed.data.enforcePermits,
        logChannelCount: Object.keys(channels).length,
      },
    });
    return { success: "Server settings saved." };
  },
};
