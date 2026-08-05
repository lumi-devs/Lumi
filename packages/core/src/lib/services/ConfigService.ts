import { Service } from "#lib/module-system/Service.js";
import { FieldType, parseConfigList } from "#lib/module-system/Module.js";
import { cleanMention } from "#utilities/misc.js";
import { ApplyOptions } from "@sapphire/decorators";
import type { Piece } from "@sapphire/framework";
import type { Prisma } from "@prisma/client";
import { configLock } from "#lib/guild-transaction.js";

@ApplyOptions<Piece.Options>({ name: "config" })
export class ConfigService extends Service {
  public async setConfig(
    guildId: string,
    moduleName: string,
    key: string,
    rawValue: string,
    actorId?: string,
  ) {
    const meta = this.container.moduleStore.getRecord(moduleName)?.meta;
    if (!meta) throw new Error(`No module named \`${moduleName}\`.`);

    const field = meta.configFields?.find((f) => f.key === key);
    if (!field) {
      throw new Error(
        `\`${key}\` is not a valid config key for **${moduleName}**.`,
      );
    }

    const coerced = this.coerce(rawValue, field.type, field.choices);
    if (coerced === null) {
      const hint =
        field.type === FieldType.ENUM
          ? `Choices: ${field.choices!.join(", ")}`
          : `Expected ${field.type}.`;
      throw new Error(`Invalid value: ${hint}`);
    }

    const schema = await this.container.moduleStore.getConfigSchema(moduleName);
    const schemaField = (
      schema as unknown as {
        shape?: Record<string, { parse(v: unknown): unknown }>;
      }
    )?.shape?.[key];
    if (schemaField) {
      try {
        schemaField.parse(coerced);
      } catch (err: any) {
        const msg = err.message || String(err);
        throw new Error(`Invalid value for \`${key}\`: ${msg}`);
      }
    }

    const validator = this.container.configValueValidators.get(
      `${moduleName}:${key}`,
    );
    if (validator) {
      const reason = await validator(coerced, guildId);
      if (reason) throw new Error(`Invalid value for \`${key}\`: ${reason}`);
    }

    const release = await configLock(guildId, moduleName);
    try {
      await this.#write(guildId, moduleName, key, coerced, actorId);
    } finally {
      release();
    }

    return { coerced };
  }

  /**
   * Read-modify-write of a BOOLEAN field (panel toggles). The read has to
   * happen under the same lock as the write, or two clicks landing together
   * both read the old value and the second flip is lost.
   */
  public async toggleConfigBool(
    guildId: string,
    moduleName: string,
    key: string,
    actorId?: string,
  ): Promise<boolean> {
    const meta = this.container.moduleStore.getRecord(moduleName)?.meta;
    const field = meta?.configFields?.find((f) => f.key === key);
    if (!field || field.type !== FieldType.BOOLEAN) {
      throw new Error(`\`${key}\` is not a boolean config key.`);
    }

    const release = await configLock(guildId, moduleName);
    try {
      const stored = await this.container.db.config.getModuleConfig(
        guildId,
        moduleName,
        key,
      );
      const fallback = field.default === undefined ? false : Boolean(field.default);
      const next = !(stored === null || stored === undefined
        ? fallback
        : Boolean(stored));
      await this.#write(guildId, moduleName, key, next, actorId);
      return next;
    } finally {
      release();
    }
  }

  /** Persist + audit + post-set hook. Caller must hold the module's config lock. */
  async #write(
    guildId: string,
    moduleName: string,
    key: string,
    coerced: unknown,
    actorId?: string,
  ): Promise<void> {
    const oldValue = await this.container.db.config.getModuleConfig(
      guildId,
      moduleName,
      key,
    );
    await this.container.db.config.setModuleConfig(
      guildId,
      moduleName,
      key,
      coerced as Prisma.InputJsonValue,
    );
    if (actorId) {
        this.container.db.configHistory
          .logConfigChange({
            guildId,
            moduleName,
            key,
            oldValue,
            newValue: coerced,
            actorId,
          })
          .catch((err: unknown) =>
            this.container.logger.warn(
              `[ConfigService] Failed to write audit history for ${moduleName}:${key}:`,
              err,
            ),
        );
    }
    const hook = this.container.configChangeHooks.get(`${moduleName}:${key}`);
    if (hook) {
      hook(guildId, key).catch((err: unknown) =>
        this.container.logger.warn(
          `[ConfigService] Post-set hook failed for ${moduleName}:${key}:`,
          err,
        ),
      );
    }
  }

  public async toggleGlobalModule(name: string, enable: boolean) {
    if (name === "core") {
      throw new Error("The `core` module cannot be disabled.");
    }

    const record = this.container.moduleStore.getRecord(name);
    if (!record) {
      throw new Error(`No module named \`${name}\`.`);
    }

    await this.container.moduleStore.setEnabled(name, enable);
    return record;
  }

  /**
   * Flip a module's per-guild enabled state. Reads and writes under the
   * module's config lock so a double-clicked panel toggle applies twice
   * instead of two handlers both flipping off the same stale value.
   */
  public async flipGuildModule(guildId: string, name: string) {
    const record = this.container.moduleStore.getRecord(name);
    if (!record) {
      throw new Error(`No module named \`${name}\`.`);
    }

    const release = await configLock(guildId, name);
    try {
      const isEnabled = await this.container.db.modules.isModuleGuildEnabled(
        guildId,
        name,
      );
      await this.container.db.modules.setModuleGuildEnabled(
        guildId,
        name,
        !isEnabled,
      );
      return { changed: true, enabled: !isEnabled, record };
    } finally {
      release();
    }
  }

  public async toggleGuildModule(
    guildId: string,
    name: string,
    enable: boolean,
  ) {
    const record = this.container.moduleStore.getRecord(name);
    if (!record) {
      throw new Error(`No module named \`${name}\`.`);
    }

    const isEnabled = await this.container.db.modules.isModuleGuildEnabled(
      guildId,
      name,
    );
    if (isEnabled === enable) {
      return { changed: false, record };
    }

    await this.container.db.modules.setModuleGuildEnabled(
      guildId,
      name,
      enable,
    );
    return { changed: true, record };
  }

  public async getConfig(
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
      return this.container.db.config.getModuleConfig(guildId, moduleName, key);
    }

    const [base, overrides] = await Promise.all([
      this.container.db.config.getModuleConfig(guildId, moduleName, key),
      this.container.db.configOverrides.getConfigOverrides(
        guildId,
        moduleName,
        key,
      ),
    ]);
    if (overrides.length === 0) return base;

    const PRIORITY: Record<string, number> = {
      user: 0,
      channel: 1,
      role: 2,
      category: 3,
    };
    let bestPriority = Infinity;
    let bestValue: unknown = base;

    for (const o of overrides) {
      const p = PRIORITY[o.modelType];
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

  /**
   * Typed read for comma-list STRING fields. Values are stored verbatim; this
   * applies the single shared `parseConfigList` transform so callers get `string[]`.
   */
  public async getConfigList(
    guildId: string,
    moduleName: string,
    key: string,
  ): Promise<string[]> {
    return parseConfigList(
      await this.container.db.config.getModuleConfig(guildId, moduleName, key),
    );
  }

  public coerce(value: string, type: FieldType, choices?: string[]): unknown {
    const lower = value.toLowerCase();
    switch (type) {
      case FieldType.BOOLEAN: {
        const trueSet = new Set(["true", "yes", "1", "on"]);
        const falseSet = new Set(["false", "no", "0", "off"]);
        if (trueSet.has(lower)) return true;
        if (falseSet.has(lower)) return false;
        return null;
      }
      case FieldType.NUMBER: {
        const n = Number(value);
        return isNaN(n) ? null : n;
      }
      case FieldType.ENUM:
        return choices?.includes(value) ? value : null;
      case FieldType.CHANNEL:
      case FieldType.ROLE:
      case FieldType.USER: {
        const id = cleanMention(value);
        return /^\d{17,20}$/.test(id) ? id : null;
      }
      default:
        return value;
    }
  }
}

declare module "#lib/module-system/Service.js" {
  interface Services {
    config: ConfigService;
  }
}
