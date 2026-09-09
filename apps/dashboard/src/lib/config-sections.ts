import type { ConfigField } from "@lumi/contracts";

export interface ConfigSection {
  name: string;
  groups: { name: string | null; fields: ConfigField[] }[];
  fieldCount: number;
}

/**
 * Splits a module's fields into the sections and subsections its schema
 * declares, preserving declaration order. The dashboard never names a section
 * itself — everything here comes from `section`/`group` in the module's own
 * `configSchema`, so adding a field in core is enough to make it appear.
 *
 * Fields with no `section` collapse into a single unnamed section, which is
 * how every module that hasn't opted into a divided page renders.
 */
export function sectionsOf(fields: ConfigField[]): ConfigSection[] {
  const order: string[] = [];
  const bySection = new Map<string, ConfigField[]>();

  for (const field of fields) {
    const name = field.section ?? "";
    if (!bySection.has(name)) {
      bySection.set(name, []);
      order.push(name);
    }
    bySection.get(name)!.push(field);
  }

  return order.map((name) => {
    const sectionFields = bySection.get(name)!;
    const groupOrder: (string | null)[] = [];
    const byGroup = new Map<string | null, ConfigField[]>();

    for (const field of sectionFields) {
      const group = field.group ?? null;
      if (!byGroup.has(group)) {
        byGroup.set(group, []);
        groupOrder.push(group);
      }
      byGroup.get(group)!.push(field);
    }

    return {
      name,
      groups: groupOrder.map((group) => ({
        name: group,
        fields: byGroup.get(group)!,
      })),
      fieldCount: sectionFields.length,
    };
  });
}
