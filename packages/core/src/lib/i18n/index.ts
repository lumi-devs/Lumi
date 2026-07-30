import { container } from "@sapphire/framework";
import type {
  InternationalizationContext,
  InternationalizationOptions,
} from "@sapphire/plugin-i18next";
import type { TFunction } from "i18next";
import { fileURLToPath } from "node:url";

/**
 * The namespaces Lumi ships. Kept as a tuple so a bound `TFunction` accepts
 * cross-namespace prefixed keys (e.g. `t("commands:foo")`). Extend this when a
 * new namespace JSON is added under `src/languages/<lng>/`.
 */
export type LumiNamespaces = [
  "common",
  "commands",
  "preconditions",
  "core",
  "tempvc",
  "afk",
  "logging",
  "filter",
];

/** A translation function bound to every Lumi namespace. */
export type LumiT = TFunction<LumiNamespaces>;

/** The language used when nothing more specific can be resolved. */
export const DEFAULT_LANGUAGE = "en-US";

/**
 * Languages that ship with Lumi. Each entry must:
 *  - be a valid Discord locale string, and
 *  - have a matching `src/languages/<locale>/` directory of namespace files.
 *
 * Adding a language is purely additive: drop in the directory, list it here.
 * Translations are managed via Crowdin; untranslated stubs fall back to en-US.
 */
export const SUPPORTED_LANGUAGES = [
  "cs", "da", "de", "el", "en-US", "es-ES", "fi", "fr", "hu", "it",
  "ja", "ko", "nl", "no", "pl", "pt-BR", "ro", "ru", "sv-SE", "tr",
  "uk", "vi", "zh-CN", "zh-TW",
] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const supported = new Set<string>(SUPPORTED_LANGUAGES);

export function isSupportedLanguage(
  language: string,
): language is SupportedLanguage {
  return supported.has(language);
}

const LANGUAGE_ROOT = fileURLToPath(
  new URL("../../languages/", import.meta.url),
);

/**
 * Resolves the language for a translation target. Guild context wins (so a whole
 * server speaks one language); outside a guild we have no per-user storage yet,
 * so the plugin's own fallback chain (guild.preferredLocale → defaultName →
 * en-US) takes over when this returns nullish.
 */
async function fetchLanguage(
  context: InternationalizationContext,
): Promise<string | null> {
  const { guild } = context;
  if (!guild) return null;
  try {
    const settings = await container.db.config.getGuildSettings(guild.id);
    return settings.locale || null;
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
    defaultLanguageDirectory: LANGUAGE_ROOT,
    fetchLanguage,
    i18next: (_namespaces, languages) => ({
      supportedLngs: languages,
      preload: languages,
      returnEmptyString: false,
      returnNull: false,
      load: "all",
      lng: DEFAULT_LANGUAGE,
      fallbackLng: DEFAULT_LANGUAGE,
      defaultNS: "common",
      initImmediate: false,
      interpolation: { escapeValue: false },
      overloadTranslationOptionHandler: (args) => ({
        defaultValue: args[1] ?? "common:default",
      }),
    }),
  };
}
