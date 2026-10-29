import type { ModuleSummary } from "@lumi/module-runtime";

export const ModulesPerPage = 4;

interface SupermoduleItem extends ModuleSummary {
  enabled: boolean;
  submoduleCount: number;
}

interface SubmoduleItem extends ModuleSummary {
  enabled: boolean;
}

export function supermoduleItems(
  modules: readonly ModuleSummary[],
  isEnabled: (name: string) => boolean,
): SupermoduleItem[] {
  return modules
    .filter((module) => !module.isSubmodule)
    .map((module) => ({
      ...module,
      enabled: isEnabled(module.name),
      submoduleCount: modules.filter(
        (child) => child.isSubmodule && child.supermodule === module.name,
      ).length,
    }));
}

export function submoduleItems(
  modules: readonly ModuleSummary[],
  supermodule: string,
  isEnabled: (name: string) => boolean,
): SubmoduleItem[] {
  return modules
    .filter((module) => module.isSubmodule && module.supermodule === supermodule)
    .map((module) => ({
      ...module,
      enabled: isEnabled(module.name),
    }));
}

export function moduleListRowId(name: string, page: number): string {
  return `lumi:modsubs:${name}:${page}`;
}

/** Supermodule rows and submodule pages share the `lumi:modsubs` id scheme. */
export const submodulePagePrefix = moduleListRowId;

export function submoduleToggleId(
  moduleName: string,
  originPage: number,
  childPage: number,
): string {
  return `lumi:modsubtoggle:${moduleName}:${originPage}.${childPage}`;
}

export function parseSubmoduleTogglePages(value: string): {
  originPage: number;
  childPage: number;
} {
  const [origin, child] = value.split(".");
  return {
    originPage: Number(origin) || 0,
    childPage: Number(child) || 0,
  };
}
