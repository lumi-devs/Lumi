import { describe, expect, it } from "bun:test";
import { FieldType, type ConfigField } from "@lumi/contracts";
import { sectionsOf } from "#/lib/config-sections";

function field(
  key: string,
  section?: string,
  group?: string,
): ConfigField {
  return {
    key,
    label: key,
    description: "",
    type: FieldType.Boolean,
    ...(section ? { section } : {}),
    ...(group ? { group } : {}),
  };
}

describe("sectionsOf", () => {
  it("collapses a schema with no sections into one unnamed section", () => {
    const result = sectionsOf([field("a"), field("b")]);
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("");
    expect(result[0]!.fieldCount).toBe(2);
  });

  it("preserves schema declaration order, not alphabetical order", () => {
    const result = sectionsOf([
      field("a", "Zulu"),
      field("b", "Alpha"),
      field("c", "Zulu"),
    ]);
    expect(result.map((s) => s.name)).toEqual(["Zulu", "Alpha"]);
  });

  it("keeps fields of one section together when they are not adjacent", () => {
    const result = sectionsOf([
      field("a", "One"),
      field("b", "Two"),
      field("c", "One"),
    ]);
    expect(result[0]!.groups[0]!.fields.map((f) => f.key)).toEqual(["a", "c"]);
    expect(result[0]!.fieldCount).toBe(2);
  });

  it("splits a section into its declared groups, in order", () => {
    const result = sectionsOf([
      field("a", "S", "Second"),
      field("b", "S", "First"),
      field("c", "S", "Second"),
    ]);
    expect(result[0]!.groups.map((g) => g.name)).toEqual(["Second", "First"]);
    expect(result[0]!.groups[0]!.fields.map((f) => f.key)).toEqual(["a", "c"]);
  });

  it("represents ungrouped fields as a null group rather than dropping them", () => {
    const result = sectionsOf([field("a", "S"), field("b", "S", "G")]);
    expect(result[0]!.groups.map((g) => g.name)).toEqual([null, "G"]);
    expect(result[0]!.fieldCount).toBe(2);
  });

  it("returns nothing for an empty schema", () => {
    expect(sectionsOf([])).toEqual([]);
  });
});
