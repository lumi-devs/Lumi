import { promises as fs } from "node:fs";
import path from "node:path";
import { AddonModulesRoot } from "@lumi/lib/downloader/resolver.js";
import {
  isMaxVersionCompatible,
  isVersionCompatible,
} from "@lumi/lib/downloader/validate.js";
import { LumiInfo } from "@lumi/lib/utilities/version.js";
import { runCheck } from "@lumi/lib/doctor/run-check.js";
import type { DoctorCheckResult } from "@lumi/lib/doctor/types.js";

export const AddonCompatCheckName = "addon-compat";

interface AddonInfo {
  name?: string;
  min_bot_version?: string;
  max_bot_version?: string;
}

export interface InstalledAddon {
  name: string;
  info: AddonInfo | null;
}

export interface AddonCompatCheckDeps {
  /** Current Lumi version to check addons against; defaults to `LumiInfo.version`. */
  currentVersion?: string;
  /**
   * Override for tests; defaults to listing `AddonModulesRoot` and reading
   * each entry's `info.json` (the same file `validateAddon()` reads).
   */
  listInstalledAddons?: () => Promise<InstalledAddon[]>;
}

async function defaultListInstalledAddons(): Promise<InstalledAddon[]> {
  const entries = await fs.readdir(AddonModulesRoot, { withFileTypes: true }).catch(() => []);
  const addons: InstalledAddon[] = [];
  for (const entry of entries) {
    const infoPath = path.join(AddonModulesRoot, entry.name, "info.json");
    try {
      const raw = await fs.readFile(infoPath, "utf8");
      addons.push({ name: entry.name, info: JSON.parse(raw) as AddonInfo });
    } catch {
      addons.push({ name: entry.name, info: null });
    }
  }
  return addons;
}

export async function checkAddonCompat(
  deps: AddonCompatCheckDeps = {},
  timeoutMs = 5_000,
): Promise<DoctorCheckResult> {
  return runCheck(AddonCompatCheckName, timeoutMs, async () => {
    const currentVersion = deps.currentVersion ?? LumiInfo.version;
    const addons = await (deps.listInstalledAddons ?? defaultListInstalledAddons)();

    if (addons.length === 0) {
      return {
        name: AddonCompatCheckName,
        status: "ok",
        detail: "No addons installed.",
      };
    }

    const incompatible: string[] = [];
    for (const addon of addons) {
      if (!addon.info) continue;
      const { min_bot_version, max_bot_version } = addon.info;
      if (min_bot_version && !isVersionCompatible(min_bot_version, currentVersion)) {
        incompatible.push(
          `${addon.name} requires >= ${min_bot_version} (running ${currentVersion})`,
        );
        continue;
      }
      if (max_bot_version && !isMaxVersionCompatible(max_bot_version, currentVersion)) {
        incompatible.push(
          `${addon.name} requires <= ${max_bot_version} (running ${currentVersion})`,
        );
      }
    }

    if (incompatible.length > 0) {
      return {
        name: AddonCompatCheckName,
        status: "fail",
        detail: `Incompatible addon(s): ${incompatible.join("; ")}.`,
        hint: "Update the addon or Lumi itself so their supported version ranges overlap.",
      };
    }
    return {
      name: AddonCompatCheckName,
      status: "ok",
      detail: `All ${addons.length} installed addon(s) are compatible with Lumi ${currentVersion}.`,
    };
  });
}
