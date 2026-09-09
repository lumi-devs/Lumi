import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SecurityWidgets } from "#/lib/security-widgets";

// Read rather than import: pulling the module in would drag Sapphire and the
// whole bot runtime into a dashboard test worker for the sake of some strings.
const SecurityModuleSource = fileURLToPath(
  new URL(
    "../../../../packages/core/src/modules/security/index.ts",
    import.meta.url,
  ),
);

function declaredSections(): string[] {
  const source = readFileSync(SecurityModuleSource, "utf8");
  const sections = new Set<string>();
  for (const m of source.matchAll(/\bsection:\s*"([^"]+)"/g)) sections.add(m[1]!);
  return [...sections];
}

describe("security widget placement", () => {
  it("reads the sections the schema actually declares", () => {
    // Guards the regex: a schema refactor that stopped matching would make
    // every assertion below vacuously true.
    expect(declaredSections().length).toBeGreaterThan(1);
  });

  it("attaches every widget to a section the schema declares", () => {
    const declared = declaredSections();
    for (const [widget, section] of Object.entries(SecurityWidgets)) {
      expect(declared, `widget ${widget}`).toContain(section);
    }
  });

  it("leaves no declared section without a widget mapping", () => {
    // Not strictly required — a section with no widget still renders its
    // settings — but an unmapped section is nearly always a rename that lost
    // its console, so it is worth failing on.
    const mapped = new Set<string>(Object.values(SecurityWidgets));
    expect(declaredSections().filter((s) => !mapped.has(s))).toEqual([]);
  });
});
