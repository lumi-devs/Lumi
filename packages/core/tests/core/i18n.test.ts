import { describe, it, expect, beforeAll } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { InternationalizationHandler } from "@sapphire/plugin-i18next";
import {
  buildI18nOptions,
  DEFAULT_LANGUAGE,
  isSupportedLanguage,
  SUPPORTED_LANGUAGES,
} from "#core/i18n/index.js";

const LANGUAGE_ROOT = fileURLToPath(
  new URL("../../src/languages/", import.meta.url),
);

async function collectKeys(
  obj: Record<string, unknown>,
  prefix = "",
): Promise<string[]> {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...(await collectKeys(value as Record<string, unknown>, path)));
    } else {
      keys.push(path);
    }
  }
  return keys.sort();
}

async function namespaceKeys(language: string): Promise<Map<string, string[]>> {
  const dir = join(LANGUAGE_ROOT, language);
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  const result = new Map<string, string[]>();
  for (const file of files) {
    const ns = file.replace(/\.json$/, "");
    const json = JSON.parse(await readFile(join(dir, file), "utf8"));
    result.set(ns, await collectKeys(json));
  }
  return result;
}

describe("i18n framework", () => {
  let handler: InternationalizationHandler;

  beforeAll(async () => {
    handler = new InternationalizationHandler(buildI18nOptions());
    await handler.init();
  });

  it("declares en-US as the default language", () => {
    expect(DEFAULT_LANGUAGE).toBe("en-US");
    expect(SUPPORTED_LANGUAGES).toContain("en-US");
  });

  it("isSupportedLanguage gates on the supported set", () => {
    expect(isSupportedLanguage("en-US")).toBe(true);
    expect(isSupportedLanguage("xx-YY")).toBe(false);
  });

  it("loads every supported language directory", () => {
    const loaded = [...handler.languages.keys()];
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(loaded).toContain(lang);
    }
  });

  it("translates keys across namespaces with interpolation", () => {
    const t = handler.getT(DEFAULT_LANGUAGE);
    expect(t("common:success")).toBe("Success");
    expect(t("commands:languageCurrent", { language: "en-US" })).toContain(
      "en-US",
    );
    expect(t("preconditions:administrator")).toContain("Administrator");
  });

  it("keeps every language at key parity with en-US", async () => {
    const reference = await namespaceKeys(DEFAULT_LANGUAGE);
    for (const lang of SUPPORTED_LANGUAGES) {
      if (lang === DEFAULT_LANGUAGE) continue;
      const candidate = await namespaceKeys(lang);
      expect([...candidate.keys()].sort()).toEqual(
        [...reference.keys()].sort(),
      );
      for (const [ns, keys] of reference) {
        expect(candidate.get(ns)).toEqual(keys);
      }
    }
  });
});
