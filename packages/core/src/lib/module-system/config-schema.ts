import { s, type BaseValidator } from "@sapphire/shapeshift";
import type { ChannelType } from "discord.js";
import { FieldType, type ConfigField } from "@lumi/contracts";

export { FieldType, type ConfigField };

/** A validated object schema produced by `cfg.object(...)`. */
export type ModuleConfigSchema = BaseValidator<Record<string, unknown>>;

type FieldMeta = Omit<ConfigField, "key">;

/** UI/coercion metadata keyed by the exact Shapeshift schema instance it decorates. */
const Registry = new WeakMap<BaseValidator<any>, FieldMeta>();

function tag<T extends BaseValidator<any>>(schema: T, meta: FieldMeta): T {
  Registry.set(schema, meta);
  return schema;
}

const snowflake = () => s.string().regex(/^\d{17,20}$/);

interface BaseOpts {
  label: string;
  description: string;
  required?: boolean;
  /** Panel subsection this field belongs to. Fields sharing a group render
   * together as one navigable section; omit for small modules. */
  group?: string;
}

const base = (o: BaseOpts) => ({
  label: o.label,
  description: o.description,
  required: o.required,
  group: o.group,
});

/** Config field builders tagged with UI metadata. */
export const cfg = {
  object<T extends Record<string, BaseValidator<any>>>(shape: T) {
    return s.object(shape);
  },

  boolean(o: BaseOpts & { default?: boolean }) {
    return tag(s.boolean(), {
      type: FieldType.BOOLEAN,
      ...base(o),
      default: o.default,
    });
  },

  number(o: BaseOpts & { default?: number; min?: number; max?: number }) {
    let schema = s.number();
    if (o.min !== undefined) schema = schema.greaterThanOrEqual(o.min);
    if (o.max !== undefined) schema = schema.lessThanOrEqual(o.max);
    return tag(schema, {
      type: FieldType.NUMBER,
      ...base(o),
      default: o.default,
    });
  },

  /** Free-text. Pass `list: true` for comma-separated values (stored verbatim, read as `string[]`). */
  string(o: BaseOpts & { default?: string; list?: boolean }) {
    return tag(s.string(), {
      type: FieldType.STRING,
      ...base(o),
      default: o.default,
      list: o.list,
    });
  },

  enum<const C extends readonly [string, ...string[]]>(
    choices: C,
    o: BaseOpts & { default?: C[number] },
  ) {
    return tag(s.enum(choices), {
      type: FieldType.ENUM,
      ...base(o),
      default: o.default,
      choices: [...choices],
    });
  },

  channel(o: BaseOpts & { default?: string; channelTypes?: ChannelType[] }) {
    return tag(snowflake(), {
      type: FieldType.CHANNEL,
      ...base(o),
      default: o.default,
      channelTypes: o.channelTypes,
    });
  },

  role(o: BaseOpts & { default?: string }) {
    return tag(snowflake(), {
      type: FieldType.ROLE,
      ...base(o),
      default: o.default,
    });
  },

  user(o: BaseOpts & { default?: string }) {
    return tag(snowflake(), {
      type: FieldType.USER,
      ...base(o),
      default: o.default,
    });
  },
};

type ObjectLike = { shape?: Record<string, BaseValidator<unknown>> };

/** Derive the flat `ConfigField[]` the panel/dashboard consume from a module's schema. */
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
  return fields;
}

/**
 * Validate a raw value against the field `key` declares in `schema`. Keys with
 * no declared field pass through unchecked (mirrors the module's own schema
 * being the sole source of truth — nothing to validate against otherwise).
 */
export function validateModuleConfigValue(
  schema: ModuleConfigSchema,
  key: string,
  value: unknown,
): unknown {
  const { shape } = schema as unknown as ObjectLike;
  const field = shape?.[key];
  return field ? field.parse(value) : value;
}

/** Parses comma-separated configuration string lists. */
export function parseConfigList(raw: unknown): string[] {
  if (Array.isArray(raw))
    return raw.filter((x): x is string => typeof x === "string");
  if (typeof raw === "string")
    return raw
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
  return [];
}

export const snowflakeString = () => s.string().regex(/^\d{17,20}$/);

export const durationString = () => s.string().regex(/^\d+[smhd]$/);

export function choiceEnum<T extends string>(opts: readonly T[]) {
  return s.enum(opts);
}
