import { sectionsOf } from "#src/contracts/Index.ts";
import { securityModule } from "#src/modules/security/Index.js";
import { describe, expect, it } from "bun:test";

const fields = securityModule.meta.configFields ?? [];

describe("security config sections", () => {
  it("declares fields at all", () => {
    expect(fields.length).toBeGreaterThan(10);
  });

  it("gives every grouped field a section", () => {

    const orphans = fields
      .filter((f) => f.group && !f.section)
      .map((f) => f.key);
    expect(orphans).toEqual([]);
  });

  it("never puts one group in two sections", () => {

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

    const order: string[] = [];
    for (const f of fields) {
      if (f.section && !order.includes(f.section)) order.push(f.section);
    }

    expect(order).toEqual(["Panic mode", "Anti-nuke", "Join gate", "Backups"]);
  });

  it("names the dashboard widget each section hosts", () => {
    expect(sectionsOf(fields).map((s) => [s.name, s.widget])).toEqual([
      ["Panic mode", "panic-console"],
      ["Anti-nuke", "anti-nuke"],
      ["Join gate", "join-gate"],
      ["Backups", "backups"],
    ]);
  });
});
