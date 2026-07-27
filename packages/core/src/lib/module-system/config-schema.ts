import { s, type BaseValidator } from "@sapphire/shapeshift";
import type { ChannelType } from "discord.js";
import { FieldType, type ConfigField } from "@lumi/contracts";

export { FieldType, type ConfigField };

/** A validated object schema produced by `cfg.object(...)`. */
export type ModuleConfigSchema = BaseValidator<Record<string, unknown>>;

type FieldMeta = Omit<ConfigField, "key">;

/** UI/coercion metadata keyed by the exact Shapeshift schema instance it decorates. */
const REGISTRY = new WeakMap<BaseValidator<any>, FieldMeta>();

function tag<T extends BaseValidator<any>>(schema: T, meta: FieldMeta): T {
  REGISTRY.set(schema, meta);
  return schema;
}

const snowflake = () => s.string().regex(/^\d{17,20}$/);

interface BaseOpts {
  label: string;
  description: string;
  required?: boolean;
}

/** Config field builders tagged with UI metadata. */
export const cfg = {
  object<T extends Record<string, BaseValidator<any>>>(shape: T) {
    return s.object(shape);
  },

  boolean(o: BaseOpts & { default?: boolean }) {
    return tag(s.boolean(), {
      type: FieldType.BOOLEAN,
      label: o.label,
      description: o.description,
      default: o.default,
      required: o.required,
    });
  },

  number(o: BaseOpts & { default?: number; min?: number; max?: number }) {
    let schema = s.number();
    if (o.min !== undefined) schema = schema.greaterThanOrEqual(o.min);
    if (o.max !== undefined) schema = schema.lessThanOrEqual(o.max);
    return tag(schema, {
      type: FieldType.NUMBER,
      label: o.label,
      description: o.description,
      default: o.default,
      required: o.required,
    });
  },

  /** Free-text. Pass `list: true` for comma-separated values (stored verbatim, read as `string[]`). */
  string(o: BaseOpts & { default?: string; list?: boolean }) {
    return tag(s.string(), {
      type: FieldType.STRING,
      label: o.label,
      description: o.description,
      default: o.default,
      required: o.required,
      list: o.list,
    });
  },

  enum<const C extends readonly [string, ...string[]]>(
    choices: C,
    o: BaseOpts & { default?: C[number] },
  ) {
    return tag(s.enum(choices), {
      type: FieldType.ENUM,
      label: o.label,
      description: o.description,
      default: o.default,
      required: o.required,
      choices: [...choices],
    });
  },

  channel(o: BaseOpts & { default?: string; channelTypes?: ChannelType[] }) {
    return tag(snowflake(), {
      type: FieldType.CHANNEL,
      label: o.label,
      description: o.description,
      default: o.default,
      required: o.required,
      channelTypes: o.channelTypes,
    });
  },

  role(o: BaseOpts & { default?: string }) {
    return tag(snowflake(), {
      type: FieldType.ROLE,
      label: o.label,
      description: o.description,
      default: o.default,
      required: o.required,
    });
  },

  user(o: BaseOpts & { default?: string }) {
    return tag(snowflake(), {
      type: FieldType.USER,
      label: o.label,
      description: o.description,
      default: o.default,
      required: o.required,
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
      const meta = REGISTRY.get(field);
      if (!meta) continue;
      fields.push({ key, ...meta });
    }
  }
  return fields;
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
