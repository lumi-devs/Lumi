import path from "node:path";
import { fieldsFromSchema } from "#src/lib/module-system/ConfigSchema.js";
import type { ModuleDefinition, ModuleMeta } from "#src/lib/module-system/Meta.js";
import { LumiInfo } from "#src/lib/utilities/Version.js";
import {
  type ModuleManifest,
} from "#src/contracts/Index.ts";

export { type ModuleManifest };

export const ManifestFile = "manifest.json";

export function manifestFromMeta(
  meta: ModuleMeta | ModuleDefinition,
): ModuleManifest {
  const configFields =
    meta.configFields ??
    (meta.configSchema ? fieldsFromSchema(meta.configSchema) : []);

  return {
    name: meta.name!,
    displayName: meta.displayName ?? meta.name!,
    emoji: meta.emoji ?? "⚙️",
    description: meta.description ?? "",
    short: meta.short,
    endUserDataStatement: meta.endUserDataStatement,
    version: meta.version ?? LumiInfo.version,
    disableable: meta.disableable ?? true,
    dependencies: meta.dependencies ?? [],
    conflicts: meta.conflicts ?? [],
    configOverrides: meta.configOverrides ?? false,
    configFields,
    category: meta.category,
    dashboardHref: meta.dashboardHref,
    author: meta.author,
    requirements: meta.requirements,
    install_msg: meta.install_msg,
    tags: meta.tags,
    hidden: meta.hidden,
    disabled: meta.disabled,
    min_bot_version: meta.min_bot_version,
    max_bot_version: meta.max_bot_version,
  };
}

export function metaFromManifest(manifest: ModuleManifest): ModuleMeta {
  return {
    name: manifest.name,
    displayName: manifest.displayName,
    emoji: manifest.emoji,
    description: manifest.description,
    short: manifest.short,
    endUserDataStatement: manifest.endUserDataStatement,
    version: manifest.version,
    disableable: manifest.disableable ?? true,
    dependencies: manifest.dependencies ?? [],
    conflicts: manifest.conflicts ?? [],
    configOverrides: manifest.configOverrides ?? false,
    configFields: manifest.configFields ?? [],
    category: manifest.category,
    dashboardHref: manifest.dashboardHref,
    author: manifest.author,
    requirements: manifest.requirements,
    install_msg: manifest.install_msg,
    tags: manifest.tags,
    hidden: manifest.hidden,
    disabled: manifest.disabled,
    min_bot_version: manifest.min_bot_version,
    max_bot_version: manifest.max_bot_version,
  };
}

export async function readManifest(
  dir: string,
): Promise<ModuleManifest | null> {
  const file = path.join(dir, ManifestFile);
  try {
    return (await Bun.file(file).json()) as ModuleManifest;
  } catch {
    return null;
  }
}

export async function writeManifest(
  dir: string,
  manifest: ModuleManifest,
): Promise<void> {
  const file = path.join(dir, ManifestFile);
  await Bun.write(file, `${JSON.stringify(manifest, null, 2)}\n`);
}
