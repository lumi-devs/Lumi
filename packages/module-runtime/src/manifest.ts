import { z } from "zod";

export const ManifestSchema = z.object({
  apiVersion: z.literal(2),
  name: z.string().regex(/^[a-z][a-z0-9-]*$/),
  displayName: z.string().min(1).max(50),
  emoji: z.string().min(1).max(10),
  description: z.string().min(1).max(200),
  version: z.string().regex(/^\d+\.\d+\.\d+/),
  entry: z.string().min(1),
  dependencies: z.record(z.string()).default({}),
  requirements: z.array(z.string()).default([]),
  conflicts: z.array(z.string()).default([]),
  capabilities: z.array(z.object({
    name: z.string(),
    version: z.string(),
    provides: z.array(z.string()),
  })).default([]),
  minBotVersion: z.string().optional(),
  maxBotVersion: z.string().optional(),
});

export type ModuleManifest = z.infer<typeof ManifestSchema>;

export function validateManifest(data: unknown): ModuleManifest {
  return ManifestSchema.parse(data);
}

export function isManifestValid(data: unknown): data is ModuleManifest {
  return ManifestSchema.safeParse(data).success;
}