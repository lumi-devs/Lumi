import { Utility } from "#lib/module-system/Utility.js";
import { isNullish, tryParseJSON } from "@sapphire/utilities";
import { ApplyOptions } from "@sapphire/decorators";
import type { Piece } from "@sapphire/framework";
import type { Guild } from "@prisma/client";
import {
  DefaultLanguage,
  isSupportedLanguage,
  SupportedLanguages,
} from "#lib/i18n/index.js";

@ApplyOptions<Piece.Options>({ name: "guild-settings" })
export class GuildSettingsUtility extends Utility {
  public async setDashboardLayout(guildId: string, rawLayout: string) {
    const layout = tryParseJSON(rawLayout);
    if (isNullish(layout)) {
      throw new Error("The layout must be valid JSON (parse failed).");
    }
    if (!Array.isArray(layout)) {
      throw new Error("The layout must be a valid JSON array of widget names.");
    }

    await this.container.db.config.setModuleConfig(
      guildId,
      "core",
      "dashboard_layout",
      layout,
    );

    return layout;
  }

  public async setPrefix(guildId: string, newPrefix: string) {
    if (newPrefix.length > 5)
      throw new Error("Prefix must be 5 characters or less.");

    await this.applyGuildUpdate(
      guildId,
      { prefix: newPrefix },
      (s) => s.prefix === newPrefix,
      `Prefix is already set to \`${newPrefix}\`.`,
    );
  }

  public async resetPrefix(guildId: string) {
    await this.applyGuildUpdate(
      guildId,
      { prefix: null },
      (s) => s.prefix === null,
      "Prefix is already unset (using default).",
    );
  }

  public async setLanguage(guildId: string, language: string) {
    if (!isSupportedLanguage(language)) {
      throw new Error(
        `Unsupported language. Supported: ${SupportedLanguages.join(", ")}.`,
      );
    }

    await this.applyGuildUpdate(
      guildId,
      { locale: language },
      (s) => s.locale === language,
      `Language is already set to ${language}.`,
    );
  }

  public async resetLanguage(guildId: string) {
    await this.applyGuildUpdate(
      guildId,
      { locale: DefaultLanguage },
      (s) => s.locale === DefaultLanguage,
      `Language is already set to ${DefaultLanguage}.`,
    );
  }

  /**
   * Shared guild-settings write: opens a guild transaction, rejects the change
   * as a no-op when `isUnchanged`, otherwise applies `patch`. Always disposes
   * the underlying lock.
   */
  private async applyGuildUpdate(
    guildId: string,
    patch: Partial<Guild>,
    isUnchanged: (current: Readonly<Guild>) => boolean,
    unchangedMessage: string,
  ): Promise<void> {
    const tx = await this.container.db.transaction(guildId);
    try {
      if (isUnchanged(tx.settings)) throw new Error(unchangedMessage);
      await tx.write(patch).submit();
    } finally {
      tx.dispose();
    }
  }
}

declare module "#lib/module-system/Utility.js" {
  interface Utilities {
    "guild-settings": GuildSettingsUtility;
  }
}
