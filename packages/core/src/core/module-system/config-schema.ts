import { z } from "zod";
import type { ChannelType } from "discord.js";
import { FieldType, type ConfigField } from "@ember/contracts";

export { FieldType, type ConfigField };

// ─────────────────────────────────────────────────────────────────────────────
// Zod-first module config.
//
// A module declares ONE Zod object schema as the single source of truth for its
// settings (`configSchema` in the module meta). Fields are built with the `cfg.*`
// helpers below, each of which returns a Zod schema *tagged* with the UI metadata
// (`label`, picker `type`, `choices`, `channelTypes`, `default`, …) that the
// `/config` panel and the dashboard RPC need. The flat `ConfigField[]` the panel
// consumes is derived from the schema via `fieldsFromSchema` — modules never hand-
// write it. Writes are validated and coerced through the schema; comma-list reads
// go through the single `parseConfigList` transform.
// ─────────────────────────────────────────────────────────────────────────────

type FieldMeta = Omit<ConfigField, "key">;

/** UI/coercion metadata keyed by the exact Zod schema instance it decorates. */
const REGISTRY = new WeakMap<z.ZodTypeAny, FieldMeta>();

function tag<T extends z.ZodTypeAny>(schema: T, meta: FieldMeta): T {
  REGISTRY.set(schema, meta);
  return schema;
}

const snowflake = () =>
  z.string().regex(/^\d{17,20}$/, "must be a valid Discord ID");

interface BaseOpts {
  label: string;
  description: string;
  required?: boolean;
}

/**
 * Config field builders. Each returns a Zod schema validating the *coerced* value
 * (what is stored), tagged with the UI metadata the panel renders from.
 */
export const cfg = {
  object<T extends z.ZodRawShape>(shape: T) {
    return z.object(shape);
  },

  boolean(o: BaseOpts & { default?: boolean }) {
    return tag(z.boolean(), {
      type: FieldType.BOOLEAN,
      label: o.label,
      description: o.description,
      default: o.default,
      required: o.required,
    });
  },

  number(o: BaseOpts & { default?: number; min?: number; max?: number }) {
    let schema = z.number();
    if (o.min !== undefined) schema = schema.min(o.min);
    if (o.max !== undefined) schema = schema.max(o.max);
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
    return tag(z.string(), {
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
    return tag(z.enum(choices), {
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

/** Derive the flat `ConfigField[]` the panel/dashboard consume from a module's schema. */
export function fieldsFromSchema(
  schema: z.ZodObject<z.ZodRawShape>,
): ConfigField[] {
  const fields: ConfigField[] = [];
  for (const [key, field] of Object.entries(schema.shape)) {
    const meta = REGISTRY.get(field as z.ZodTypeAny);
    if (!meta) continue; // un-tagged keys are not user-configurable
    fields.push({ key, ...meta });
  }
  return fields;
}

/**
 * The single comma→`string[]` transform. Accepts a stored string ("a, b, c"),
 * an already-parsed array, or nullish, and always yields a clean `string[]`.
 */
export function parseConfigList(raw: unknown): string[] {
  if (Array.isArray(raw))
    return raw.filter((x): x is string => typeof x === "string");
  if (typeof raw === "string")
    return raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  return [];
}
