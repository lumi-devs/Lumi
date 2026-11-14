import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseConfigForm } from "../src/lib/server/moduleConfig.js";
import type { ConfigField } from "../src/lib/server/modules.js";

const Root = fileURLToPath(new URL("../../..", import.meta.url));
const ModulesDir = join(Root, "modules");

function manifests(): Array<{ path: string; fields: ConfigField[] }> {
  const found: Array<{ path: string; fields: ConfigField[] }> = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (entry.name !== "manifest.json") continue;
      const manifest = JSON.parse(readFileSync(path, "utf8")) as {
        configFields?: ConfigField[];
      };
      found.push({ path, fields: manifest.configFields ?? [] });
    }
  };
  walk(ModulesDir);
  return found;
}

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("dashboard config parsing", () => {
  it("accepts every numeric default and enforces manifest bounds", () => {
    for (const { path, fields } of manifests()) {
      for (const field of fields) {
        if (field.type !== "number" || field.default === undefined) continue;
        const defaultResult = parseConfigForm(
          [field],
          form({ [field.key]: String(field.default) }),
        );
        expect(defaultResult.ok, `${path} ${field.key} default`).toBe(true);
        if (field.integer !== false) {
          expect(
            Number.isInteger(Number(field.default)),
            `${path} ${field.key} default must be an integer`,
          ).toBe(true);
          const decimal = parseConfigForm(
            [field],
            form({ [field.key]: `${Number(field.default) + 0.5}` }),
          );
          expect(decimal.ok, `${path} ${field.key} rejects decimals`).toBe(
            false,
          );
        }
        if (field.min !== undefined) {
          const below = parseConfigForm(
            [field],
            form({ [field.key]: String(field.min - 1) }),
          );
          expect(below.ok, `${path} ${field.key} rejects below min`).toBe(
            false,
          );
        }
        if (field.max !== undefined) {
          const above = parseConfigForm(
            [field],
            form({ [field.key]: String(field.max + 1) }),
          );
          expect(above.ok, `${path} ${field.key} rejects above max`).toBe(
            false,
          );
        }
      }
    }
  });

  it("splits multi-string values only on newlines", () => {
    const result = parseConfigForm(
      [
        {
          key: "terms",
          label: "Terms",
          type: "multi-string",
        },
      ],
      form({ terms: "a{1,3}\nb,c" }),
    );
    expect(result.ok).toBe(true);
    expect(result.values?.terms).toEqual(["a{1,3}", "b,c"]);
  });

  it("rejects escalation counts outside 1-1000", () => {
    const field: ConfigField = {
      key: "escalation",
      label: "Escalation",
      type: "escalation",
    };
    const invalid = parseConfigForm(
      [field],
      form({
        escalation: JSON.stringify({
          "0": { action: "timeout", duration: 60 },
        }),
      }),
    );
    expect(invalid.ok).toBe(false);
    const valid = parseConfigForm(
      [field],
      form({
        escalation: JSON.stringify({
          "3": { action: "timeout", duration: 60 },
        }),
      }),
    );
    expect(valid.ok).toBe(true);
  });
});
