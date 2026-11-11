import { z } from "zod";

const ConfigKeySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z][A-Za-z0-9_.-]*$/);

const ModuleNameSchema = z
  .string()
  .max(64)
  .regex(/^[a-z][a-z0-9-]*$/);

const ConfigFieldSchema = z.object({
  key: ConfigKeySchema,
  label: z.string(),
  type: z.enum([
    "boolean",
    "number",
    "string",
    "channel",
    "role",
    "multi-channel",
    "multi-role",
    "json",
    "select",
    "multi-string",
    "escalation",
  ]),
  description: z.string().optional(),
  required: z.boolean().optional(),
  default: z.unknown().optional(),
  choices: z.array(z.string()).optional(),
  channelTypes: z.array(z.number()).optional(),
  category: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
});

const EntryPathSchema = z
  .string()
  .min(1)
  .max(255)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.startsWith("\\") &&
      !/^[A-Za-z]:[\\/]/.test(value) &&
      !value.split(/[\\/]/).includes("..") &&
      /\.(?:[cm]?[jt]sx?)$/i.test(value),
    {
      message:
        "entry must be a relative JS/TS path inside the module directory",
    },
  );

export const ModuleManifestSchema = z.object({
  apiVersion: z.literal(2),
  name: ModuleNameSchema,
  displayName: z.string().min(1).max(50),
  emoji: z.string().min(1).max(10),
  description: z.string().min(1).max(200),
  version: z
    .string()
    .max(32)
    .regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/),
  category: z.string().min(1).max(32).optional(),
  entry: EntryPathSchema,
  configKey: ConfigKeySchema.optional(),
  dependencies: z.record(ModuleNameSchema, z.string().max(64)).default({}),
  requirements: z.array(z.string()).default([]),
  conflicts: z.array(ModuleNameSchema).default([]),
  capabilities: z
    .array(
      z.object({
        name: z.string(),
        version: z.string(),
        provides: z.array(z.string()),
      }),
    )
    .default([]),
  configFields: z.array(ConfigFieldSchema).default([]),
});

export type ModuleManifest = z.infer<typeof ModuleManifestSchema>;
export type ConfigField = z.infer<typeof ConfigFieldSchema>;

export function validateManifest(data: unknown): ModuleManifest {
  return ModuleManifestSchema.parse(data);
}
