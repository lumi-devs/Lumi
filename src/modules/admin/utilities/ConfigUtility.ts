import { defineUtility } from "@module-system/Utility.js";
import type { Container } from "@lib/Services.js";
import { FieldType } from "@module-system/ConfigSchema.js";
import { validateModuleConfigValue } from "@module-system/ConfigSchema.js";
import { cleanMention, isSnowflakeId } from "@utilities/Snowflakes.js";
import type { Prisma } from "@prisma/client";
import { configLock } from "@db/GuildTransaction.js";

async function write(
  services: Container,
  guildId: string,
  moduleName: string,
  key: string,
  coerced: unknown,
  actorId?: string,
): Promise<void> {
  await services.db.config.setModuleConfig(
    guildId,
    moduleName,
    key,
    coerced as Prisma.InputJsonValue,
    actorId,
  );
  const hook = services.configChangeHooks.get(`${moduleName}:${key}`);
  if (hook) {
    hook(guildId, key).catch((err: unknown) =>
      services.logger.warn(
        `[ConfigUtility] Post-set hook failed for ${moduleName}:${key}:`,
        err,
      ),
    );
  }
}

function coerce(value: unknown, type: FieldType, choices?: string[]): unknown {
  switch (type) {
    case FieldType.Boolean: {
      if (typeof value === "boolean") return value;
      if (typeof value !== "string") return null;
      const lower = value.toLowerCase();
      const trueSet = new Set(["true", "yes", "1", "on"]);
      const falseSet = new Set(["false", "no", "0", "off"]);
      if (trueSet.has(lower)) return true;
      if (falseSet.has(lower)) return false;
      return null;
    }
    case FieldType.Number: {
      if (typeof value === "number") return value;
      if (typeof value !== "string") return null;
      const n = Number(value);
      return isNaN(n) ? null : n;
    }
    case FieldType.Enum:
      return typeof value === "string" && choices?.includes(value) ? value : null;
    case FieldType.Channel:
    case FieldType.Role:
    case FieldType.User: {
      if (typeof value !== "string") return null;
      const id = cleanMention(value);
      return isSnowflakeId(id) ? id : null;
    }
    case FieldType.Duration:
      return typeof value === "string" ? value : null;
    case FieldType.MultiRole:
    case FieldType.MultiChannel:
    case FieldType.MultiUser: {
      const entries = Array.isArray(value)
        ? value.map(String)
        : typeof value === "string"
          ? value.split(/[,\n]/)
          : null;
      if (!entries) return null;
      return entries
        .map((entry) => cleanMention(entry.trim()))
        .filter((id) => id.length > 0);
    }
    case FieldType.StringList: {
      const entries = Array.isArray(value)
        ? value.map(String)
        : typeof value === "string"
          ? value.split(/\r?\n/)
          : null;
      if (!entries) return null;
      return entries
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
    }
    case FieldType.ObjectArray:
      return Array.isArray(value) ? value : null;
    default:
      return value;
  }
}

export const configUtility = defineUtility({
  name: "config",

  coerce,

  async setConfig(
    services: Container,
    guildId: string,
    moduleName: string,
    key: string,
    rawValue: unknown,
    actorId?: string,
  ) {
    const meta = services.moduleStore.getRecord(moduleName)?.meta;
    if (!meta) throw new Error(`No module named \`${moduleName}\`.`);

    const field = meta.configFields?.find((f) => f.key === key);
    if (!field) {
      throw new Error(
        `\`${key}\` is not a valid config key for **${moduleName}**.`,
      );
    }

    const coerced = coerce(rawValue, field.type, field.choices);
    if (coerced === null) {
      const hint =
        field.type === FieldType.Enum
          ? `Choices: ${field.choices!.join(", ")}`
          : `Expected ${field.type}.`;
      throw new Error(`Invalid value: ${hint}`);
    }

    const schema = await services.moduleStore.getConfigSchema(moduleName);
    if (schema) {
      try {
        validateModuleConfigValue(schema, key, coerced);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Invalid value for \`${key}\`: ${msg}`);
      }
    }

    const validator = services.configValueValidators.get(
      `${moduleName}:${key}`,
    );
    if (validator) {
      const reason = await validator(coerced, guildId);
      if (reason) throw new Error(`Invalid value for \`${key}\`: ${reason}`);
    }

    const release = await configLock(guildId);
    try {
      await write(services, guildId, moduleName, key, coerced, actorId);
    } finally {
      release();
    }

    return { coerced };
  },

  async toggleConfigBool(
    services: Container,
    guildId: string,
    moduleName: string,
    key: string,
    actorId?: string,
  ): Promise<boolean> {
    const meta = services.moduleStore.getRecord(moduleName)?.meta;
    const field = meta?.configFields?.find((f) => f.key === key);
    if (!field || field.type !== FieldType.Boolean) {
      throw new Error(`\`${key}\` is not a boolean config key.`);
    }

    const release = await configLock(guildId);
    try {
      const stored = await services.db.config.getModuleConfig(
        guildId,
        moduleName,
        key,
      );
      const fallback = field.default === undefined ? false : Boolean(field.default);
      const next = !(stored === null || stored === undefined
        ? fallback
        : Boolean(stored));
      await write(services, guildId, moduleName, key, next, actorId);
      return next;
    } finally {
      release();
    }
  },

  async flipGuildModule(services: Container, guildId: string, name: string) {
    const record = services.moduleStore.getRecord(name);
    if (!record) {
      throw new Error(`No module named \`${name}\`.`);
    }

    const release = await configLock(guildId);
    try {
      const isEnabled = await services.db.modules.isModuleGuildEnabled(
        guildId,
        name,
      );
      await services.db.modules.setModuleGuildEnabled(
        guildId,
        name,
        !isEnabled,
      );
      return { changed: true, enabled: !isEnabled, record };
    } finally {
      release();
    }
  }
});

export type ConfigUtility = typeof configUtility;

declare module "@module-system/Utility.js" {
  interface Utilities {
    config: typeof configUtility;
  }
}
