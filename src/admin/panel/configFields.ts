import type { ConfigField } from "@lumi/module-runtime";
import { pagesOf } from "./pages.js";

export interface FieldPage {
  label: string;
  fields: ConfigField[];
}

export function fieldPages(
  fields: readonly ConfigField[],
  perPage: number,
): FieldPage[] {
  const groups = new Map<string, ConfigField[]>();
  for (const field of fields) {
    const category = field.category?.trim() || "General";
    const group = groups.get(category);
    if (group) {
      group.push(field);
    } else {
      groups.set(category, [field]);
    }
  }

  const pages: FieldPage[] = [];
  for (const [category, group] of groups) {
    const chunks = pagesOf(group, perPage);
    for (const [index, chunk] of chunks.entries()) {
      pages.push({
        label:
          chunks.length > 1
            ? `${category} ${index + 1}/${chunks.length}`
            : category,
        fields: chunk,
      });
    }
  }

  return pages.length > 0 ? pages : [{ label: "General", fields: [] }];
}
