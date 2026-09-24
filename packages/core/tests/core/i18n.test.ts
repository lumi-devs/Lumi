import { describe, it, expect, beforeAll } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { InternationalizationHandler } from "@sapphire/plugin-i18next";
import { rpcRouter } from "@lumi/contracts/rpc";
import {
  buildI18nOptions,
  DefaultLanguage,
  isSupportedLanguage,
  SupportedLanguages,
} from "#lib/i18n/index.js";

/**
 * `s.enum(...).optional()` builds a `UnionValidator` whose `validators` array
 * is TS-private but a plain runtime property: a `LiteralValidator(undefined)`
 * (from `.optional()`) followed by one `LiteralValidator` per allowed value,
 * each carrying its literal on `.expected`.
 */
interface IntrospectableEnum {
  readonly validators: readonly { readonly expected: unknown }[];
}

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
    expect(DefaultLanguage).toBe("en-US");
    expect(SupportedLanguages).toContain("en-US");
  });

  it("isSupportedLanguage gates on the supported set", () => {
    expect(isSupportedLanguage("en-US")).toBe(true);
    expect(isSupportedLanguage("xx-YY")).toBe(false);
  });

  it("loads every supported language directory", () => {
    const loaded = [...handler.languages.keys()];
    for (const lang of SupportedLanguages) {
      expect(loaded).toContain(lang);
    }
  });

  it("translates keys across namespaces with interpolation", () => {
    const t = handler.getT(DefaultLanguage);
    expect(t("common:success")).toBe("Success");
    expect(t("commands:languageCurrent", { language: "en-US" })).toContain(
      "en-US",
    );
    expect(t("preconditions:administrator")).toContain("Administrator");
  });

  it("resolves every i18n key referenced by the denial path", () => {
    // These keys are passed as UserError context.i18nKey by the preconditions
    // and resolved by handleDenied. A typo here would silently fall back to the
    // English message, so assert they exist (don't return the missing-key tag).
    const t = handler.getT(DefaultLanguage);
    const keys = [
      "preconditions:administrator",
      "preconditions:moderator",
      "preconditions:guildOwner",
      "preconditions:botOwner",
      "preconditions:moduleDisabled",
      "common:permissionDenied",
    ];
    for (const key of keys) {
      const value = t(key, { level: "X", module: "y" });
      expect(value).not.toBe("");
      expect(value).not.toContain("has not been localized");
    }
  });

  it("has no keys on disk that aren't also in en-US", async () => {
    // A missing-key check, not a parity check: a locale short some keys of
    // en-US is a normal in-progress Crowdin translation (fallbackLng covers
    // it), but a key en-US doesn't have is a typo'd or orphaned key a
    // translator introduced, and that's a real bug.
    const reference = await namespaceKeys(DefaultLanguage);
    const locales = (await readdir(LANGUAGE_ROOT)).filter(
      (lang) => lang !== DefaultLanguage,
    );
    for (const lang of locales) {
      const candidate = await namespaceKeys(lang);
      for (const [ns, keys] of candidate) {
        const referenceKeys = reference.get(ns) ?? [];
        for (const key of keys) {
          expect(referenceKeys).toContain(key);
        }
      }
    }
  });

  it("keeps the dashboard locale enum in sync with SupportedLanguages", () => {
    const localeValidator = rpcRouter["guild.settings.set"].input as
      | { shape: { locale: IntrospectableEnum } }
      | undefined;
    if (!localeValidator) throw new Error("guild.settings.set has no input validator");

    const allowed = localeValidator.shape.locale.validators
      .map((v) => v.expected)
      .filter((value) => value !== undefined)
      .sort();
    expect(allowed).toEqual([...SupportedLanguages].sort());
  });
});
