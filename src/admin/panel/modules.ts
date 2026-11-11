import type { ModuleSummary } from "@lumi/module-runtime";

export const ModulesPerPage = 4;

export interface ModuleListItem extends ModuleSummary {
  enabled: boolean;
  category: string;
}

export function moduleItems(
  modules: readonly ModuleSummary[],
  isEnabled: (name: string) => boolean,
): ModuleListItem[] {
  return modules
    .filter((module) => module.origin === "bundled")
    .map((module) => ({
      ...module,
      enabled: isEnabled(module.name),
      category: module.category ?? "Other",
    }))
    .sort(
      (a, b) =>
        a.category.localeCompare(b.category) ||
        a.displayName.localeCompare(b.displayName),
    );
}
