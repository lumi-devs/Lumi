import semver from "semver";
import { z } from "zod";

const Name = z.string().regex(/^[a-z][a-z0-9-]*$/);
const Version = z.string().refine((value) => semver.valid(value) !== null, "not a semver version");
const Range = z.string().min(1).refine((value) => semver.validRange(value) !== null, "not a semver range");

export const ModuleManifestSchema = z.object({
  apiVersion: z.literal(2),
  name: Name,
  displayName: z.string().min(1).max(64),
  emoji: z.string().min(1).max(16).default("⚙️"),
  description: z.string().min(1).max(500),
  version: Version,
  entry: z
    .string()
    .min(1)
    .refine((value) => value.startsWith("./"), "entry must be a relative path starting with ./"),
  author: z.array(z.string().min(1)).default([]),
  homepage: z.string().url().optional(),
  license: z.string().max(64).optional(),
  dependencies: z.record(Name, Range).default({}),
  conflicts: z.array(Name).default([]),
  requirements: z.array(z.string().min(1)).default([]),
  minBotVersion: Version.optional(),
  maxBotVersion: Version.optional(),
  capabilities: z.array(z.string().min(1)).default([]),
});

export type ModuleManifest = z.infer<typeof ModuleManifestSchema>;

export function parseManifest(raw: unknown): ModuleManifest {
  return ModuleManifestSchema.parse(raw);
}

export function safeParseManifest(raw: unknown):
  | { ok: true; manifest: ModuleManifest }
  | { ok: false; issues: string[] } {
  const result = ModuleManifestSchema.safeParse(raw);
  if (result.success) return { ok: true, manifest: result.data };
  return {
    ok: false,
    issues: result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
  };
}
