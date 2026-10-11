import type { ChannelType } from "discord.js";

export enum FieldType {
  Boolean = "BOOLEAN",
  Number = "NUMBER",
  String = "STRING",
  Enum = "ENUM",
  Channel = "CHANNEL",
  Role = "ROLE",
  User = "USER",
  Duration = "DURATION",
  MultiRole = "MULTI_ROLE",
  MultiChannel = "MULTI_CHANNEL",
  MultiUser = "MULTI_USER",
  StringList = "STRING_LIST",

  ObjectArray = "OBJECT_ARRAY",

  ComponentsV2Blocks = "COMPONENTS_V2_BLOCKS",
}

export interface ConfigField {
  key: string;
  label: string;
  type: FieldType;
  description: string;
  default?: unknown;
  choices?: string[];
  required?: boolean;

  channelTypes?: ChannelType[];

  claimable?: boolean;

  step?: number;

  min?: number;
  max?: number;

  quickPicks?: string[];

  group?: string;

  section?: string;

  subfields?: ConfigField[];

  format?: string;

  templateVars?: string[];

  richPreview?: {
    accentColorKey?: string;
    footerKey?: string;
    imageUrlsKey?: string;
    buttonsKey?: string;
    thumbnailKey?: string;
  };

  pairedWith?: string;

  enabledBy?: string;

  widget?: ConfigWidget;
}

export type ConfigWidget = "panic-console" | "anti-nuke" | "join-gate" | "backups";

export interface ConfigSection {
  name: string;
  groups: { name: string | null; fields: ConfigField[] }[];
  fieldCount: number;
  widget?: ConfigWidget;
}

function groupBy<K, V>(items: V[], keyOf: (item: V) => K): { order: K[]; groups: Map<K, V[]> } {
  const order: K[] = [];
  const groups = new Map<K, V[]>();
  for (const item of items) {
    const key = keyOf(item);
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(item);
  }
  return { order, groups };
}

export function sectionsOf(fields: ConfigField[]): ConfigSection[] {
  const { order, groups: bySection } = groupBy(fields, (field) => field.section ?? "");

  return order.map((name) => {
    const sectionFields = bySection.get(name)!;
    const { order: groupOrder, groups: byGroup } = groupBy(sectionFields, (field) => field.group ?? null);

    return {
      name,
      groups: groupOrder.map((group) => ({
        name: group,
        fields: byGroup.get(group)!,
      })),
      fieldCount: sectionFields.length,
      widget: sectionFields.find((field) => field.widget)?.widget,
    };
  });
}
