import i18next, { type TFunction } from "i18next";
import {
  BaseInteraction,
  Guild,
  Message,
  type Channel,
} from "discord.js";
import { getGuildContext } from "@lumi/lib/cache/guild-context.js";
import { container, type Container } from "@lumi/lib/services.js";
import afk from "../../languages/en-US/afk.json";
import commands from "../../languages/en-US/commands.json";
import common from "../../languages/en-US/common.json";
import core from "../../languages/en-US/core.json";
import filter from "../../languages/en-US/filter.json";
import logging from "../../languages/en-US/logging.json";
import panels from "../../languages/en-US/panels.json";
import preconditions from "../../languages/en-US/preconditions.json";
import tempvc from "../../languages/en-US/tempvc.json";

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

const resources = {
  "en-US": {
    afk,
    commands,
    common,
    core,
    filter,
    logging,
    panels,
    preconditions,
    tempvc,
  },
};

let initPromise: Promise<unknown> | null = null;

export function initI18n(): Promise<unknown> {
  return (initPromise ??= i18next.init({
    lng: DefaultLanguage,
    fallbackLng: DefaultLanguage,
    supportedLngs: [...SupportedLanguages],
    preload: [...SupportedLanguages],
    ns: [
      "afk",
      "commands",
      "common",
      "core",
      "filter",
      "logging",
      "panels",
      "preconditions",
      "tempvc",
    ],
    defaultNS: "common",
    resources,
    load: "all",
    returnEmptyString: false,
    returnNull: false,
    interpolation: { escapeValue: false },
  }));
}

const fixedT = new Map<string, LumiT>();

export function getT(language: string): LumiT {
  void initI18n();
  const cached = fixedT.get(language);
  if (cached) return cached;
  const t = i18next.getFixedT(language) as unknown as LumiT;
  fixedT.set(language, t);
  return t;
}

export function translate(
  key: string,
  args?: Record<string, unknown>,
  guildLang?: string,
): string {
  return getT(guildLang ?? DefaultLanguage)(key, args);
}

export type TranslationTarget =
  | BaseInteraction
  | Message
  | Guild
  | Channel
  | null
  | undefined;

async function resolveLanguage(target: TranslationTarget, services: Container = container): Promise<string> {
  let guildId: string | null = null;
  let discordLocale: string | null = null;
  if (target instanceof BaseInteraction) {
    guildId = target.guildId;
    discordLocale = target.guildLocale ?? target.locale ?? null;
  } else if (target instanceof Message) {
    guildId = target.guild?.id ?? null;
    discordLocale = target.guild?.preferredLocale ?? null;
  } else if (target instanceof Guild) {
    guildId = target.id;
    discordLocale = target.preferredLocale;
  } else if (target && "guild" in target && target.guild) {
    guildId = target.guild.id;
  }
  if (guildId) {
    try {
      const ctx = await getGuildContext(services, guildId);
      if (ctx.locale && isSupportedLanguage(ctx.locale)) return ctx.locale;
    } catch {
      // No stored locale readable; fall through to Discord/default.
    }
  }
  if (discordLocale && isSupportedLanguage(discordLocale)) return discordLocale;
  return DefaultLanguage;
}

export async function fetchLanguage(target: TranslationTarget, services: Container = container): Promise<string> {
  return resolveLanguage(target, services);
}

export async function fetchT(target: TranslationTarget, services: Container = container): Promise<LumiT> {
  return getT(await resolveLanguage(target, services));
}

/** Resolves the translator for a target as Lumi's typed {@linkcode LumiT}. */
export function fetchTyped(
  target: Parameters<typeof fetchT>[0],
  services?: Parameters<typeof fetchT>[1],
): Promise<LumiT> {
  return fetchT(target, services);
}

export async function resolveKey(
  target: TranslationTarget,
  key: string,
  options: Record<string, unknown> | undefined,
  services: Container = container,
): Promise<string> {
  return (await fetchT(target, services))(key, options);
}

interface LocalizableBuilder {
  setName(name: string): unknown;
  setDescription(description: string): unknown;
  setNameLocalizations(localizations: Record<string, string>): unknown;
  setDescriptionLocalizations(localizations: Record<string, string>): unknown;
}

export function applyLocalizedBuilder<T extends LocalizableBuilder>(
  builder: T,
  rootKey: string,
): T {
  const nameLocalizations: Record<string, string> = {};
  const descriptionLocalizations: Record<string, string> = {};
  for (const lang of SupportedLanguages) {
    const t = getT(lang);
    nameLocalizations[lang] = t(`${rootKey}Name`);
    descriptionLocalizations[lang] = t(`${rootKey}Description`);
  }
  builder.setName(nameLocalizations[DefaultLanguage] ?? rootKey);
  builder.setNameLocalizations(nameLocalizations);
  builder.setDescription(descriptionLocalizations[DefaultLanguage] ?? rootKey);
  builder.setDescriptionLocalizations(descriptionLocalizations);
  return builder;
}
