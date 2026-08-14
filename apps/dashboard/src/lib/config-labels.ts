import { FieldType } from "@lumi/contracts";
import type {
  DashboardChannelView,
  DashboardModuleView,
  DashboardRoleView,
} from "./dashboard-data";
import { formatConfigValue } from "./log-format";

// A plain object rather than a lookup closure because it crosses the
// server/client boundary as props.
export interface ModuleLabel {
  label: string;
  emoji: string;
  fields: Record<string, string>;
  fieldTypes: Record<string, FieldType>;
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
      fieldTypes: Object.fromEntries(
        mod.configFields.map((f) => [f.key, f.type]),
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

export function fieldType(
  index: ModuleLabelIndex,
  moduleName: string,
  key: string,
): FieldType | undefined {
  return index[moduleName]?.fieldTypes[key];
}

function resolveSnowflake(
  value: unknown,
  prefix: string,
  names: Map<string, string>,
): string | null {
  if (typeof value !== "string" || value === "") return null;
  const name = names.get(value);
  return name ? `${prefix}${name}` : null;
}

export function resolveConfigValue(
  type: FieldType | undefined,
  value: unknown,
  roles: DashboardRoleView[],
  channels: DashboardChannelView[],
): string {
  if (type !== FieldType.CHANNEL && type !== FieldType.ROLE) {
    return formatConfigValue(value);
  }
  const prefix = type === FieldType.CHANNEL ? "#" : "@";
  const names = new Map(
    (type === FieldType.CHANNEL ? channels : roles).map((item) => [
      item.id,
      item.name,
    ]),
  );
  if (Array.isArray(value)) {
    return value.length === 0
      ? "Empty list"
      : value
          .map((v) => resolveSnowflake(v, prefix, names) ?? formatConfigValue(v))
          .join(", ");
  }
  return resolveSnowflake(value, prefix, names) ?? formatConfigValue(value);
}
