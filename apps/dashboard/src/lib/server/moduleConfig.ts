import { z } from "zod";
import {
  compileSafeRegex,
  RegexMaxLength,
} from "../../../../../modules/shared/regex.js";
import type { ConfigField } from "./modules";
import { checkbox, formString, splitLines, splitList } from "./validation";

const Snowflake = z
  .string()
  .regex(/^\d{16,22}$/, "Expected a Discord snowflake ID.");

const RegexFields = new Set(["regexRules", "filterUsernamePatterns"]);

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

export function enabledConfigField(
  fields: ConfigField[],
): ConfigField | undefined {
  return fields.find(
    (field) => field.key === "enabled" && field.type === "boolean",
  );
}

export function effectiveModuleEnabled(
  fields: ConfigField[],
  config: ConfigValues,
  moduleEnabled: boolean,
): boolean {
  if (!moduleEnabled) return false;
  const field = enabledConfigField(fields);
  if (!field) return true;
  const displayed = displayValues([field], config);
  return displayed[field.key] === true;
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
        if (field.integer !== false) schema = schema.int();
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
      case "escalation":
        return z
          .string()
          .max(50_000)
          .transform((value, ctx) => {
            try {
              const parsed = JSON.parse(value) as unknown;
              if (
                typeof parsed !== "object" ||
                parsed === null ||
                Array.isArray(parsed)
              ) {
                ctx.addIssue({
                  code: "custom",
                  message: "Expected escalation rules.",
                });
                return z.NEVER;
              }
              for (const [count, rule] of Object.entries(parsed)) {
                const warningCount = Number(count);
                if (
                  !Number.isInteger(warningCount) ||
                  warningCount < 1 ||
                  warningCount > 1000
                ) {
                  ctx.addIssue({
                    code: "custom",
                    message:
                      "Warning counts must be whole numbers from 1 to 1000.",
                  });
                  return z.NEVER;
                }
                if (
                  typeof rule !== "object" ||
                  rule === null ||
                  Array.isArray(rule) ||
                  !("action" in rule) ||
                  typeof rule.action !== "string" ||
                  rule.action.length === 0 ||
                  rule.action.length > 50
                ) {
                  ctx.addIssue({
                    code: "custom",
                    message: "Each escalation rule needs a valid action.",
                  });
                  return z.NEVER;
                }
                if ("duration" in rule && rule.duration !== null) {
                  if (
                    typeof rule.duration !== "number" ||
                    !Number.isInteger(rule.duration) ||
                    rule.duration < 0 ||
                    rule.duration > 2_592_000
                  ) {
                    ctx.addIssue({
                      code: "custom",
                      message:
                        "Timeout durations must be whole seconds from 0 to 2592000.",
                    });
                    return z.NEVER;
                  }
                }
              }
              return parsed;
            } catch {
              ctx.addIssue({
                code: "custom",
                message: "Expected escalation rules.",
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
      const list = splitLines(raw);
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
      if (RegexFields.has(field.key)) {
        for (const pattern of list) {
          if (pattern.length > RegexMaxLength) {
            return {
              ok: false,
              message: `${field.label}: Regex patterns are limited to ${RegexMaxLength} characters.`,
            };
          }
          const compiled = compileSafeRegex(pattern);
          if (!compiled.ok) {
            return {
              ok: false,
              message: `${field.label}: ${compiled.error}`,
            };
          }
        }
      }
      values[field.key] = list;
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
