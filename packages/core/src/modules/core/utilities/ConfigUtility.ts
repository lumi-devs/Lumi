import { defineUtility } from "@lumi/lib/module-system/utility.js";
import type { Container } from "@lumi/lib/services.js";
import { FieldType } from "@lumi/lib/module-system/config-schema.js";
import { validateModuleConfigValue } from "@lumi/lib/module-system/config-schema.js";
import { cleanMention, isSnowflakeId } from "@lumi/lib/utilities/snowflakes.js";
import type { Prisma } from "@prisma/client";
import { configLock } from "@lumi/lib/prisma/guild-transaction.js";

/** Persist + audit + post-set hook. Caller must hold the module's config lock. */
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

  /**
   * Read-modify-write of a BOOLEAN field (panel toggles). The read has to
   * happen under the same lock as the write, or two clicks landing together
   * both read the old value and the second flip is lost.
   */
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

  async toggleGlobalModule(services: Container, name: string, enable: boolean) {
    if (name === "core") {
      throw new Error("The `core` module cannot be disabled.");
    }

    const record = services.moduleStore.getRecord(name);
    if (!record) {
      throw new Error(`No module named \`${name}\`.`);
    }

    await services.moduleStore.setEnabled(name, enable);
    return record;
  },

  /**
   * Flip a module's per-guild enabled state. Reads and writes under the
   * module's config lock so a double-clicked panel toggle applies twice
   * instead of two handlers both flipping off the same stale value.
   */
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
  },

  async toggleGuildModule(
    services: Container,
    guildId: string,
    name: string,
    enable: boolean,
  ) {
    const record = services.moduleStore.getRecord(name);
    if (!record) {
      throw new Error(`No module named \`${name}\`.`);
    }

    const isEnabled = await services.db.modules.isModuleGuildEnabled(
      guildId,
      name,
    );
    if (isEnabled === enable) {
      return { changed: false, record };
    }

    await services.db.modules.setModuleGuildEnabled(
      guildId,
      name,
      enable,
    );
    return { changed: true, record };
  },

  async getConfig(
    services: Container,
    guildId: string,
    moduleName: string,
    key: string,
    ctx?: {
      userId?: string;
      channelId?: string;
      roleIds?: string[];
      categoryId?: string;
    },
  ): Promise<unknown> {
    if (!ctx) {
      return services.db.config.getModuleConfig(guildId, moduleName, key);
    }

    const [base, overrides] = await Promise.all([
      services.db.config.getModuleConfig(guildId, moduleName, key),
      services.db.configOverrides.getConfigOverrides(
        guildId,
        moduleName,
        key,
      ),
    ]);
    if (overrides.length === 0) return base;

    const Priority: Record<string, number> = {
      user: 0,
      channel: 1,
      role: 2,
      category: 3,
    };
    let bestPriority = Infinity;
    let bestValue: unknown = base;

    for (const o of overrides) {
      const p = Priority[o.modelType];
      if (p === undefined || p >= bestPriority) continue;

      const matches =
        (o.modelType === "user" && ctx.userId === o.modelId) ||
        (o.modelType === "channel" && ctx.channelId === o.modelId) ||
        (o.modelType === "role" && ctx.roleIds?.includes(o.modelId)) ||
        (o.modelType === "category" && ctx.categoryId === o.modelId);

      if (matches) {
        bestPriority = p;
        bestValue = o.value;
        if (p === 0) break;
      }
    }

    return bestValue;
  }
});

export type ConfigUtility = typeof configUtility;

declare module "@lumi/lib/module-system/utility.js" {
  interface Utilities {
    config: typeof configUtility;
  }
}
