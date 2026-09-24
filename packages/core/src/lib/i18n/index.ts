import type {
  InternationalizationContext,
  InternationalizationOptions,
} from "@sapphire/plugin-i18next";
import type { TFunction } from "i18next";
import { fileURLToPath } from "node:url";
import { getGuildContext } from "#lib/cache/GuildContext.js";

/**
 * The namespaces Lumi ships. Kept as a tuple so a bound `TFunction` accepts
 * cross-namespace prefixed keys (e.g. `t("commands:foo")`). Extend this when a
 * new namespace JSON is added under `src/languages/<lng>/`.
 */
type LumiNamespaces = [
  "common",
  "commands",
  "preconditions",
  "core",
  "tempvc",
  "afk",
  "logging",
  "filter",
  "panels",
];

/**
 * A translation function bound to every Lumi namespace. Also accepts a plain
 * string key outside `LumiNamespaces` (e.g. a namespace with no JSON resource
 * file yet) so a call site with a namespace `TFunction` can't type-check
 * doesn't hard-fail the build; `TFunction<LumiNamespaces>` alone still applies
 * first for any key inside a declared namespace.
 */
export type LumiT = TFunction<LumiNamespaces> &
  (<TArgs extends object = object, TReturn = string>(
    key: string,
    args?: TArgs,
  ) => TReturn);

/** The language used when nothing more specific can be resolved. */
export const DefaultLanguage = "en-US";

/**
 * Languages that ship with Lumi. Each entry must:
 *  - be a valid Discord locale string, and
 *  - have a matching `src/languages/<locale>/` directory of namespace files.
 *
 * Adding a language is purely additive: drop in the directory, list it here.
 * Translations are managed via Crowdin; untranslated stubs fall back to en-US.
 */
export const SupportedLanguages = ["en-US"] as const;
export type SupportedLanguage = (typeof SupportedLanguages)[number];

const supported = new Set<string>(SupportedLanguages);

export function isSupportedLanguage(
  language: string,
): language is SupportedLanguage {
  return supported.has(language);
}

const LanguageRoot = fileURLToPath(
  new URL("../../languages/", import.meta.url),
);

/**
 * Resolves the language for a translation target. Guild context wins (so a whole
 * server speaks one language); outside a guild we have no per-user storage yet,
 * so the plugin's own fallback chain (guild.preferredLocale → defaultName →
 * en-US) takes over when this returns nullish.
 *
 * `ctx.locale` could in principle still reference a locale that's since been
 * dropped from `SupportedLanguages` (set before a migration, or written by an
 * older dashboard build mid-deploy); the plugin throws for any locale it can't
 * find on disk, so an unsupported value is treated the same as an unset one.
 */
async function fetchLanguage(
  context: InternationalizationContext,
): Promise<string | null> {
  const { guild } = context;
  if (!guild) return null;
  try {
    const ctx = await getGuildContext(guild.id);
    if (!ctx.locale) return null;
    return isSupportedLanguage(ctx.locale) ? ctx.locale : null;
  } catch {
    return null;
  }
}

/**
 * Builds the `i18n` client option consumed by `@sapphire/plugin-i18next`.
 * Centralised here so `LumiClient` stays focused on wiring.
 */
export function buildI18nOptions(): InternationalizationOptions {
  return {
    defaultMissingKey: "default",
    defaultNS: "common",
    defaultLanguageDirectory: LanguageRoot,
    fetchLanguage,
    i18next: (_namespaces, languages) => ({
      supportedLngs: languages,
      preload: languages,
      returnEmptyString: false,
      returnNull: false,
      load: "all",
      lng: DefaultLanguage,
      fallbackLng: DefaultLanguage,
      defaultNS: "common",
      initImmediate: false,
      interpolation: { escapeValue: false },
      overloadTranslationOptionHandler: (args) => ({
        defaultValue: args[1] ?? "common:default",
      }),
    }),
  };
}
