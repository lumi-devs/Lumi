import type { DashboardModuleView } from "#/lib/dashboard-data";

/**
 * Groups modules by the `category` each one's own manifest declares
 * (`@DefineModule({ category: "..." })` in the module's `index.ts`). No
 * fixed category list here — a new module (core or addon) just declares its
 * own label and shows up grouped correctly, nothing to register centrally.
 */
export function groupByCategory(
  modules: DashboardModuleView[],
): Map<string, DashboardModuleView[]> {
  const groups = new Map<string, DashboardModuleView[]>();
  for (const m of modules) {
    const list = groups.get(m.category);
    if (list) list.push(m);
    else groups.set(m.category, [m]);
  }
  return groups;
}
