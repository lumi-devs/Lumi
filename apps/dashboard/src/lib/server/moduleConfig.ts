import { z } from "zod";
import type { ConfigField } from "./modules";
import { checkbox, formString, splitList } from "./validation";

const Snowflake = z
  .string()
  .regex(/^\d{16,22}$/, "Expected a Discord snowflake ID.");

export type ConfigValues = Record<string, unknown>;

export function configFor(
  settings: Record<string, unknown>,
  configKey: string,
): ConfigValues {
  const value = settings[configKey];
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as ConfigValues) }
    : {};
}

export function displayValues(
  fields: ConfigField[],
  config: ConfigValues,
): ConfigValues {
  const values: ConfigValues = { ...config };
  for (const field of fields) {
    if (values[field.key] === undefined && field.default !== undefined) {
      values[field.key] = field.default;
    }
  }
  return values;
}

function fieldSchema(field: ConfigField): z.ZodType<unknown> {
  const base = (() => {
    switch (field.type) {
      case "number": {
        let schema = z.coerce.number().finite();
        if (typeof field.min === "number") schema = schema.min(field.min);
        if (typeof field.max === "number") schema = schema.max(field.max);
        return schema;
      }
      case "channel":
      case "role":
        return Snowflake;
      case "multi-channel":
      case "multi-role":
        return z.array(Snowflake).max(100);
      case "multi-string":
        return z.array(z.string().min(1).max(200)).max(100);
      case "json":
        return z
          .string()
          .max(50_000)
          .transform((value, ctx) => {
            try {
              return JSON.parse(value) as unknown;
            } catch {
              ctx.addIssue({
                code: "custom",
                message: "Expected valid JSON.",
              });
              return z.NEVER;
            }
          });
      case "select":
        return field.choices && field.choices.length > 0
          ? z.enum(field.choices as [string, ...string[]])
          : z.string().max(200);
      case "boolean":
        return z.boolean();
      default:
        return z.string().max(2000);
    }
  })();

  return field.required ? base : base.optional();
}

export interface ConfigParseResult {
  ok: boolean;
  values?: ConfigValues;
  message?: string;
}

export function parseConfigForm(
  fields: ConfigField[],
  data: FormData,
): ConfigParseResult {
  const values: ConfigValues = {};

  for (const field of fields) {
    if (field.type === "boolean") {
      values[field.key] = checkbox(data, field.key);
      continue;
    }

    const raw = formString(data, field.key).trim();

    if (field.type === "multi-channel" || field.type === "multi-role") {
      const list = splitList(raw);
      if (list.length === 0 && field.required) {
        return { ok: false, message: `${field.label} is required.` };
      }
      const parsed = fieldSchema(field).safeParse(list);
      if (!parsed.success) {
        return {
          ok: false,
          message: `${field.label}: ${parsed.error.issues[0]?.message ?? "Invalid value."}`,
        };
      }
      values[field.key] = parsed.data;
      continue;
    }

    if (field.type === "multi-string") {
      values[field.key] = splitList(raw);
      continue;
    }

    if (raw === "") {
      if (field.required) {
        return { ok: false, message: `${field.label} is required.` };
      }
      continue;
    }

    const parsed = fieldSchema(field).safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        message: `${field.label}: ${parsed.error.issues[0]?.message ?? "Invalid value."}`,
      };
    }
    values[field.key] = parsed.data;
  }

  return { ok: true, values };
}
