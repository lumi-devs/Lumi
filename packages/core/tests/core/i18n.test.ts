import { describe, it, expect, beforeAll } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { SlashCommandBuilder } from "discord.js";
import { rpcRouter } from "@lumi/contracts/rpc";
import {
  applyLocalizedBuilder,
  DefaultLanguage,
  fetchLanguage,
  fetchT,
  getT,
  initI18n,
  isSupportedLanguage,
  resolveKey,
  SupportedLanguages,
  translate,
} from "#lib/i18n/index.js";

/**
 * `z.enum(...).optional()` is a `ZodOptional` wrapping a `ZodEnum`: unwrap to
 * the inner type and read its `options`.
 */
interface IntrospectableEnum {
  readonly unwrap?: () => { readonly options?: readonly string[] };
  readonly options?: readonly string[];
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
  beforeAll(async () => {
    await initI18n();
  });

  it("declares en-US as the default language", () => {
    expect(DefaultLanguage).toBe("en-US");
    expect(SupportedLanguages).toContain("en-US");
  });

  it("isSupportedLanguage gates on the supported set", () => {
    expect(isSupportedLanguage("en-US")).toBe(true);
    expect(isSupportedLanguage("xx-YY")).toBe(false);
  });

  it("translates keys across namespaces with interpolation", () => {
    const t = getT(DefaultLanguage);
    expect(t("common:success")).toBe("Success");
    expect(t("commands:languageCurrent", { language: "en-US" })).toContain(
      "en-US",
    );
    expect(t("preconditions:administrator")).toContain("Administrator");
  });

  it("translate() resolves per-guild language at call time", () => {
    expect(translate("common:success", undefined, "en-US")).toBe("Success");
    expect(translate("common:success")).toBe("Success");
  });

  it("falls back to en-US for unknown languages", () => {
    expect(getT("xx-YY")("common:success")).toBe("Success");
  });

  it("resolves every i18n key referenced by the denial path", () => {
    // These keys are passed as UserError context.i18nKey by the preconditions
    // and resolved by handleDenied. A typo here would silently fall back to
    // the raw key, so assert they exist (don't return the key itself).
    const t = getT(DefaultLanguage);
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
      expect(value).not.toBe(key);
    }
  });

  it("applyLocalizedBuilder localizes name and description", () => {
    const builder = applyLocalizedBuilder(
      new SlashCommandBuilder(),
      "commands:afk",
    );
    expect(builder.name).toBe("afk");
    expect(builder.description).toBe(
      "Set yourself AFK with an optional reason.",
    );
    expect(builder.toJSON().name_localizations).toEqual({
      "en-US": "afk",
    });
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

  it("fetchLanguage and fetchT resolve target context and resolveKey translates key", async () => {
    expect(await fetchLanguage(null)).toBe(DefaultLanguage);
    const t = await fetchT(null);
    expect(t("common:success")).toBe("Success");
    expect(await resolveKey(null, "common:success", undefined)).toBe("Success");
  });

  it("keeps the dashboard locale enum in sync with SupportedLanguages", () => {
    const localeValidator = rpcRouter["guild.settings.set"].input as
      | { shape: { locale: IntrospectableEnum } }
      | undefined;
    if (!localeValidator) throw new Error("guild.settings.set has no input validator");
    const inner = localeValidator.shape.locale.unwrap?.() ?? localeValidator.shape.locale;
    const options = inner.options;
    if (!options) throw new Error("guild.settings.set locale is not an enum");

    expect([...options].sort()).toEqual([...SupportedLanguages].sort());
  });
});
