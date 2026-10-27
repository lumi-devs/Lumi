import { z } from "zod";

const ConfigFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(["boolean", "number", "string", "channel", "role", "multi-channel", "multi-role", "json", "select", "multi-string"]),
  description: z.string().optional(),
  required: z.boolean().optional(),
  default: z.unknown().optional(),
  choices: z.array(z.string()).optional(),
  channelTypes: z.array(z.number()).optional(),
});

export const ModuleManifestSchema = z.object({
  apiVersion: z.literal(2),
  name: z.string().max(64).regex(/^[a-z][a-z0-9-]*$/),
  displayName: z.string().min(1).max(50),
  emoji: z.string().min(1).max(10),
  description: z.string().min(1).max(200),
  version: z.string().max(32).regex(/^\d+\.\d+\.\d+/),
  entry: z.string().min(1),
  dependencies: z.record(z.string(), z.string()).default({}),
  requirements: z.array(z.string()).default([]),
  conflicts: z.array(z.string()).default([]),
  capabilities: z.array(z.object({
    name: z.string(),
    version: z.string(),
    provides: z.array(z.string()),
  })).default([]),
  configFields: z.array(ConfigFieldSchema).default([]),
  minBotVersion: z.string().optional(),
  maxBotVersion: z.string().optional(),
});

export type ModuleManifest = z.infer<typeof ModuleManifestSchema>;
export type ConfigField = z.infer<typeof ConfigFieldSchema>;

export function validateManifest(data: unknown): ModuleManifest {
  return ModuleManifestSchema.parse(data);
}
