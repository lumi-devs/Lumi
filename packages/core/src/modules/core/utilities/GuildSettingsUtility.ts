import { defineUtility } from "@lumi/lib/module-system/utility.js";
import type { Container } from "@lumi/lib/services.js";
import type { Guild } from "@prisma/client";
import {
  DefaultLanguage,
  isSupportedLanguage,
  SupportedLanguages,
} from "@lumi/lib/i18n/index.js";

/**
 * Shared guild-settings write: opens a guild transaction, rejects the change
 * as a no-op when `isUnchanged`, otherwise applies `patch`. Always disposes
 * the underlying lock.
 */
async function applyGuildUpdate(
  services: Container,
  guildId: string,
  patch: Partial<Guild>,
  isUnchanged: (current: Readonly<Guild>) => boolean,
  unchangedMessage: string,
): Promise<void> {
  const tx = await services.db.transaction(guildId);
  try {
    if (isUnchanged(tx.settings)) throw new Error(unchangedMessage);
    await tx.write(patch).submit();
  } finally {
    tx.dispose();
  }
}

export const guildSettingsUtility = defineUtility({
  name: "guild-settings",

  async setPrefix(services: Container, guildId: string, newPrefix: string) {
    if (newPrefix.length > 5)
      throw new Error("Prefix must be 5 characters or less.");

    await applyGuildUpdate(
      services,
      guildId,
      { prefix: newPrefix },
      (s) => s.prefix === newPrefix,
      `Prefix is already set to \`${newPrefix}\`.`,
    );
  },

  async resetPrefix(services: Container, guildId: string) {
    await applyGuildUpdate(
      services,
      guildId,
      { prefix: null },
      (s) => s.prefix === null,
      "Prefix is already unset (using default).",
    );
  },

  async setLanguage(services: Container, guildId: string, language: string) {
    if (!isSupportedLanguage(language)) {
      throw new Error(
        `Unsupported language. Supported: ${SupportedLanguages.join(", ")}.`,
      );
    }

    await applyGuildUpdate(
      services,
      guildId,
      { locale: language },
      (s) => s.locale === language,
      `Language is already set to ${language}.`,
    );
  },

  async resetLanguage(services: Container, guildId: string) {
    await applyGuildUpdate(
      services,
      guildId,
      { locale: DefaultLanguage },
      (s) => s.locale === DefaultLanguage,
      `Language is already set to ${DefaultLanguage}.`,
    );
  }
});

export type GuildSettingsUtility = typeof guildSettingsUtility;

declare module "@lumi/lib/module-system/utility.js" {
  interface Utilities {
    "guild-settings": typeof guildSettingsUtility;
  }
}
