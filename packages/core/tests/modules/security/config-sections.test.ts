import type { ModuleMeta } from "#lib/module-system/Module.js";
import { SecurityModule } from "#modules/security/index.js";
import { describe, expect, it } from "bun:test";

const fields = (SecurityModule as unknown as { meta: ModuleMeta }).meta.configFields;

describe("security config sections", () => {
  it("declares fields at all", () => {
    expect(fields.length).toBeGreaterThan(10);
  });

  it("gives every grouped field a section", () => {
    // The dashboard derives /security's tabs from `section` alone. A grouped
    // field without one lands in an unnamed tab beside the real ones.
    const orphans = fields
      .filter((f) => f.group && !f.section)
      .map((f) => f.key);
    expect(orphans).toEqual([]);
  });

  it("never puts one group in two sections", () => {
    // Groups are subsections of a section; splitting one across two tabs would
    // render its heading twice with the fields divided between them.
    const sectionOf = new Map<string, string>();
    const split: string[] = [];
    for (const f of fields) {
      if (!f.group || !f.section) continue;
      const seen = sectionOf.get(f.group);
      if (seen === undefined) sectionOf.set(f.group, f.section);
      else if (seen !== f.section) split.push(f.group);
    }
    expect([...new Set(split)]).toEqual([]);
  });

  it("orders the dashboard tabs by first declaration", () => {
    // Tab order is first appearance, not file order — the Panic Mode fields
    // are declared in two places on purpose. Pinned so a reshuffle in the
    // schema is a deliberate change rather than a surprise on the page.
    const order: string[] = [];
    for (const f of fields) {
      if (f.section && !order.includes(f.section)) order.push(f.section);
    }
    // Panic mode leads: it is the control someone reaches for mid-raid, so it
    // must not sit behind a tab that is not selected by default.
    expect(order).toEqual(["Panic mode", "Anti-nuke", "Join gate", "Backups"]);
  });
});
