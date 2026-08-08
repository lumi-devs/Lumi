import type { DashboardModuleView } from "./dashboard-data";

// A plain object rather than a lookup closure because it crosses the
// server/client boundary as props.
export interface ModuleLabel {
  label: string;
  emoji: string;
  fields: Record<string, string>;
}

export type ModuleLabelIndex = Record<string, ModuleLabel>;

export function buildModuleLabelIndex(
  modules: DashboardModuleView[],
): ModuleLabelIndex {
  const index: ModuleLabelIndex = {};
  for (const mod of modules) {
    index[mod.name] = {
      label: mod.displayName || mod.name,
      emoji: mod.emoji,
      fields: Object.fromEntries(
        mod.configFields.map((f) => [f.key, f.label || f.key]),
      ),
    };
  }
  return index;
}

export function moduleLabel(index: ModuleLabelIndex, name: string): string {
  return index[name]?.label ?? name;
}

export function moduleEmoji(
  index: ModuleLabelIndex,
  name: string,
): string | null {
  return index[name]?.emoji || null;
}

export function fieldLabel(
  index: ModuleLabelIndex,
  moduleName: string,
  key: string,
): string {
  return index[moduleName]?.fields[key] ?? key;
}
