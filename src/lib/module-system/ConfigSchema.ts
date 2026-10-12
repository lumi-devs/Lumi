import { z } from "zod";
import type { ChannelType } from "discord.js";
import {
  FieldType,
  type ConfigField,
  type ConfigWidget,
  type MessageDocumentV2,
} from "#src/contracts/Index.ts";
import { defineModuleConfig } from "#src/lib/module-system/ModuleConfig.js";

export { FieldType, type ConfigField, defineModuleConfig };

export type ModuleConfigSchema = z.ZodType<Record<string, unknown>>;

type FieldMeta = Omit<ConfigField, "key">;

const Registry = new WeakMap<z.ZodType, FieldMeta>();

function tag<T extends z.ZodType>(schema: T, meta: Record<string, unknown>): T {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (value !== undefined) clean[key] = value;
  }
  Registry.set(schema, clean as FieldMeta);
  return schema;
}

const snowflake = () => z.string().regex(/^\d{17,20}$/);

interface BaseOpts {
  label: string;
  description: string;
  required?: boolean;

  group?: string;

  section?: string;

  enabledBy?: string;

  widget?: ConfigWidget;
}

const base = (o: BaseOpts) => ({
  label: o.label,
  description: o.description,
  required: o.required,
  group: o.group,
  section: o.section,
  enabledBy: o.enabledBy,
  widget: o.widget,
});

export const cfg = {
  object<T extends Record<string, z.ZodType>>(shape: T) {
    return z.object(shape);
  },

  boolean(o: BaseOpts & { default?: boolean; pairedWith?: string }) {
    return tag(z.boolean(), {
      type: FieldType.Boolean,
      ...base(o),
      default: o.default,
      pairedWith: o.pairedWith,
    });
  },

  number(o: BaseOpts & { default?: number; min?: number; max?: number; step?: number }) {
    let schema = z.number();
    if (o.min !== undefined) schema = schema.min(o.min);
    if (o.max !== undefined) schema = schema.max(o.max);
    return tag(schema, {
      type: FieldType.Number,
      ...base(o),
      default: o.default,
      step: o.step,
      min: o.min,
      max: o.max,
    });
  },

  string(
    o: BaseOpts & {
      default?: string;
      format?: "color" | "template" | "multiline" | "image";
      templateVars?: string[];
      richPreview?: {
        accentColorKey?: string;
        footerKey?: string;
        imageUrlsKey?: string;
        buttonsKey?: string;
        thumbnailKey?: string;
      };
    },
  ) {
    return tag(z.string(), {
      type: FieldType.String,
      ...base(o),
      default: o.default,
      format: o.format,
      templateVars: o.templateVars,
      richPreview: o.richPreview,
    });
  },

  enum<const C extends readonly [string, ...string[]]>(
    choices: C,
    o: BaseOpts & { default?: C[number] },
  ) {
    return tag(z.enum(choices), {
      type: FieldType.Enum,
      ...base(o),
      default: o.default,
      choices: [...choices],
    });
  },

  channel(
    o: BaseOpts & {
      default?: string;
      channelTypes?: ChannelType[];
      claimable?: boolean;
    },
  ) {
    return tag(snowflake(), {
      type: FieldType.Channel,
      ...base(o),
      default: o.default,
      channelTypes: o.channelTypes,
      claimable: o.claimable,
    });
  },

  role(o: BaseOpts & { default?: string }) {
    return tag(snowflake(), {
      type: FieldType.Role,
      ...base(o),
      default: o.default,
    });
  },

  user(o: BaseOpts & { default?: string }) {
    return tag(snowflake(), {
      type: FieldType.User,
      ...base(o),
      default: o.default,
    });
  },

  duration(o: BaseOpts & { default?: string; quickPicks?: string[] }) {
    return tag(durationString(), {
      type: FieldType.Duration,
      ...base(o),
      default: o.default,
      quickPicks: o.quickPicks,
    });
  },

  multiRole(o: BaseOpts & { default?: string[] }) {
    return tag(z.array(snowflake()), {
      type: FieldType.MultiRole,
      ...base(o),
      default: o.default,
    });
  },

  multiChannel(o: BaseOpts & { default?: string[]; channelTypes?: ChannelType[] }) {
    return tag(z.array(snowflake()), {
      type: FieldType.MultiChannel,
      ...base(o),
      default: o.default,
      channelTypes: o.channelTypes,
    });
  },

  multiUser(o: BaseOpts & { default?: string[] }) {
    return tag(z.array(snowflake()), {
      type: FieldType.MultiUser,
      ...base(o),
      default: o.default,
    });
  },

  stringList(o: BaseOpts & { default?: string[] }) {
    return tag(z.array(z.string()), {
      type: FieldType.StringList,
      ...base(o),
      default: o.default,
    });
  },

  componentsV2Blocks(
    o: BaseOpts & { default?: MessageDocumentV2; templateVars?: string[] },
  ) {
    return tag(z.object({ accentColor: z.string().optional(), blocks: z.array(z.any()) }), {
      type: FieldType.ComponentsV2Blocks,
      ...base(o),
      default: o.default ?? { blocks: [] },
      templateVars: o.templateVars,
    });
  },

  objectArray<T extends Record<string, z.ZodType>>(
    shape: T,
    o: BaseOpts & { default?: Array<Record<string, unknown>> },
  ) {
    const subfields: ConfigField[] = Object.entries(shape).map(([key, f]) => {
      const meta = Registry.get(f);
      if (!meta) throw new Error(`cfg.objectArray: "${key}" is not a cfg.* field`);
      if (meta.type === FieldType.ObjectArray)
        throw new Error(`cfg.objectArray: "${key}" is nested - one level only`);
      return { key, ...meta };
    });
    return tag(z.array(z.object(shape)), {
      type: FieldType.ObjectArray,
      ...base(o),
      default: o.default,
      subfields,
    });
  },
};

type ObjectLike = { shape?: Record<string, z.ZodType> };

export function fieldsFromSchema(schema: ModuleConfigSchema): ConfigField[] {
  const fields: ConfigField[] = [];
  const { shape } = schema as unknown as ObjectLike;
  if (shape) {
    for (const [key, field] of Object.entries(shape)) {
      const meta = Registry.get(field);
      if (!meta) continue;
      fields.push({ key, ...meta });
    }
  }

  const byKey = new Map(fields.map((f) => [f.key, f]));
  for (const field of fields) {
    if (field.enabledBy !== undefined) {
      const target = byKey.get(field.enabledBy);
      if (!target)
        throw new Error(
          `Config field "${field.key}": enabledBy references unknown key "${field.enabledBy}"`,
        );
      if (target.type !== FieldType.Boolean)
        throw new Error(
          `Config field "${field.key}": enabledBy "${field.enabledBy}" is not a BOOLEAN field`,
        );
    }
    if (field.pairedWith !== undefined && !byKey.has(field.pairedWith))
      throw new Error(
        `Config field "${field.key}": pairedWith references unknown key "${field.pairedWith}"`,
      );
  }

  return fields;
}

export function validateModuleConfigValue(
  schema: ModuleConfigSchema,
  key: string,
  value: unknown,
): unknown {
  const { shape } = schema as unknown as ObjectLike;
  const field = shape?.[key];
  return field ? field.parse(value) : value;
}

export function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

export const snowflakeString = () => z.string().regex(/^\d{17,20}$/);

export const durationString = () => z.string().regex(/^\d+[smhd]$/);

export function choiceEnum<T extends string>(opts: readonly T[]) {
  return z.enum(opts as [T, ...T[]]);
}
