import { promises as fs, constants as fsConstants } from "node:fs";
import { DataRoot, ModuleRoot, AddonModulesRoot } from "#lib/downloader/resolver.js";
import { runCheck } from "#lib/doctor/util.js";
import type { DoctorCheckResult } from "#lib/doctor/types.js";

export const FilesystemCheckName = "filesystem";

export interface FilesystemCheckDeps {
  /** Override for tests; defaults to `{data: DataRoot, addons: ModuleRoot, installed: AddonModulesRoot}`. */
  dirs?: Record<string, string>;
  /** Override for tests; defaults to `fs.access(dir, W_OK)`. */
  checkWritable?: (dir: string) => Promise<void>;
}

async function defaultCheckWritable(dir: string): Promise<void> {
  await fs.access(dir, fsConstants.W_OK);
}

export async function checkFilesystem(
  deps: FilesystemCheckDeps = {},
  timeoutMs = 2_000,
): Promise<DoctorCheckResult> {
  return runCheck(FilesystemCheckName, timeoutMs, async () => {
    const dirs =
      deps.dirs ??
      {
        data: DataRoot,
        addons: ModuleRoot,
        "installed-addons": AddonModulesRoot,
      };
    const checkWritable = deps.checkWritable ?? defaultCheckWritable;

    const problems: string[] = [];
    for (const [label, dir] of Object.entries(dirs)) {
      try {
        await checkWritable(dir);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          problems.push(`${label} (${dir}) does not exist`);
        } else {
          problems.push(`${label} (${dir}) is not writable: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    if (problems.length > 0) {
      return {
        name: FilesystemCheckName,
        status: "fail",
        detail: problems.join("; "),
        hint: "Create the missing directory and ensure the process's user can write to it (addon install/download and per-guild state both depend on it).",
      };
    }
    return {
      name: FilesystemCheckName,
      status: "ok",
      detail: `All ${Object.keys(dirs).length} data/addon directories exist and are writable.`,
    };
  });
}
