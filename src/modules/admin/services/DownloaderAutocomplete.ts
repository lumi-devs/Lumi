import type { AutocompleteInteraction } from "discord.js";
import type { Container } from "#src/lib/Services.js";
import type { DownloaderUtility } from "#src/modules/admin/utilities/DownloaderUtility.js";
import { filterAutocompleteChoices } from "#src/lib/utilities/Autocomplete.js";

export async function repoNameChoices(
  services: Container,
  downloaderService: DownloaderUtility,
  focusedValue: string,
  opts?: { extra?: string[] | undefined },
): Promise<string[]> {
  const names = (await downloaderService.listRepos(services)).map((r) => r.name);
  if (opts?.extra) names.push(...opts.extra);
  return filterAutocompleteChoices(names, focusedValue);
}

export async function installedModuleChoices(
  services: Container,
  downloaderService: DownloaderUtility,
  focusedValue: string,
  opts?: { pinned?: boolean | undefined },
): Promise<string[]> {
  const installed = await downloaderService.getInstalledModules(services);
  const names = installed
    .filter((m) => opts?.pinned === undefined || m.pinned === opts.pinned)
    .map((m) => m.moduleName);
  return filterAutocompleteChoices(names, focusedValue);
}

export async function repoModuleChoices(
  services: Container,
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
      downloaderService.getInstalledModules(services),
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
