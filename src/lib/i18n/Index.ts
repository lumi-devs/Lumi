import i18next, { type TFunction } from "i18next";
import {
  BaseInteraction,
  Guild,
  Message,
  type Channel,
} from "discord.js";
import { getGuildContext } from "#src/lib/cache/GuildContext.js";
import { container, type Container } from "#src/lib/Services.js";
import afk from "#src/languages/en-US/afk.json";
import commands from "#src/languages/en-US/commands.json";
import common from "#src/languages/en-US/common.json";
import core from "#src/languages/en-US/core.json";
import filter from "#src/languages/en-US/filter.json";
import logging from "#src/languages/en-US/logging.json";
import panels from "#src/languages/en-US/panels.json";
import preconditions from "#src/languages/en-US/preconditions.json";
import tempvc from "#src/languages/en-US/tempvc.json";

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

export type LumiT = TFunction<LumiNamespaces> &
  (<TArgs extends object = object, TReturn = string>(
    key: string,
    args?: TArgs,
  ) => TReturn);

export const DefaultLanguage = "en-US";

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
