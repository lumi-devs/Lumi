import type { AutocompleteInteraction } from "discord.js";
import type { DownloaderUtility } from "#utilities/DownloaderUtility.js";
import { filterAutocompleteChoices } from "#lib/utilities/autocomplete.js";

export async function repoNameChoices(
  downloaderService: DownloaderUtility,
  focusedValue: string,
  opts?: { extra?: string[] },
): Promise<string[]> {
  const names = (await downloaderService.listRepos()).map((r) => r.name);
  if (opts?.extra) names.push(...opts.extra);
  return filterAutocompleteChoices(names, focusedValue);
}

export async function installedModuleChoices(
  downloaderService: DownloaderUtility,
  focusedValue: string,
  opts?: { pinned?: boolean },
): Promise<string[]> {
  const installed = await downloaderService.getInstalledModules();
  const names = installed
    .filter((m) => opts?.pinned === undefined || m.pinned === opts.pinned)
    .map((m) => m.moduleName);
  return filterAutocompleteChoices(names, focusedValue);
}

export async function repoModuleChoices(
  downloaderService: DownloaderUtility,
  interaction: AutocompleteInteraction,
  repoOptionName: string,
  focusedValue: string,
): Promise<string[]> {
  const repoName = interaction.options.getString(repoOptionName);
  if (!repoName) return [];
  try {
    const [modules, installed] = await Promise.all([
      downloaderService.getModulesInRepo(repoName),
      downloaderService.getInstalledModules(),
    ]);
    const installedNames = new Set(installed.map((m) => m.moduleName));
    const names = modules
      .filter((m) => !m.hidden && !installedNames.has(m.name))
      .map((m) => m.name);
    return filterAutocompleteChoices(names, focusedValue);
  } catch {
    return [];
  }
}
