import { Service } from "#core/module-system/Service.js";
import { FieldType } from "#core/module-system/Module.js";
import { ApplyOptions } from "@sapphire/decorators";
import type { Piece } from "@sapphire/framework";
import type { Prisma } from "@prisma/client";

@ApplyOptions<Piece.Options>({ name: "config" })
export class ConfigService extends Service {
  public async setConfig(
    guildId: string,
    moduleName: string,
    key: string,
    rawValue: string,
  ) {
    const meta = this.container.moduleStore.getRecord(moduleName)?.meta;
    if (!meta) throw new Error(`No module named \`${moduleName}\`.`);

    const field = meta.configFields?.find(
      (f: import("#core/module-system/Module.js").ConfigField) => f.key === key,
    );
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

    await this.container.db.setModuleConfig(
      guildId,
      moduleName,
      key,
      coerced as Prisma.InputJsonValue,
    );

    return { coerced };
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

  public async toggleGuildModule(
    guildId: string,
    name: string,
    enable: boolean,
  ) {
    const record = this.container.moduleStore.getRecord(name);
    if (!record) {
      throw new Error(`No module named \`${name}\`.`);
    }

    const isEnabled = await this.container.db.isModuleGuildEnabled(
      guildId,
      name,
    );
    if (isEnabled === enable) {
      return { changed: false, record };
    }

    await this.container.db.setModuleGuildEnabled(guildId, name, enable);
    return { changed: true, record };
  }

  public coerce(value: string, type: FieldType, choices?: string[]): unknown {
    const lower = value.toLowerCase();
    switch (type) {
      case FieldType.BOOLEAN:
        return lower === "true" || lower === "yes" || lower === "1";
      case FieldType.NUMBER: {
        const n = Number(value);
        return isNaN(n) ? null : n;
      }
      case FieldType.ENUM:
        return choices?.includes(value) ? value : null;
      case FieldType.CHANNEL:
      case FieldType.ROLE:
      case FieldType.USER: {
        const id = value.replace(/[<@&#!>]/g, "");
        return /^\d{17,20}$/.test(id) ? id : null;
      }
      default:
        return value;
    }
  }
}
