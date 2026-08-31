import { moduleUpdateResultCard } from "#lib/downloader/cards.js";
import { getUtility } from "#lib/module-system/Utility.js";
import {
  ModuleAlreadyInstalledError,
  type DownloaderUtility,
} from "#utilities/DownloaderUtility.js";
import { Emojis } from "#lib/utilities/assets.js";
import {
  makeErrorCard,
  makeSuccessCard,
  type CardReply,
} from "#lib/utilities/cards.js";
import { errorFrom } from "#lib/utilities/errors.js";
import {
  moduleAlreadyInstalledCard,
  moduleNotFoundCard,
  modulePinnedCard,
  moduleUnpinnedCard,
  multiUpdateReportCard,
  noInstalledModulesCard,
  type ModuleUpdateOutcome,
} from "#modules/core/lib/module-command/cards.js";
import { container } from "@sapphire/framework";
import type { User } from "discord.js";

function downloader(): DownloaderUtility {
  return getUtility("downloader");
}

/**
 * Flips a module's global toggle and reports the outcome.
 *
 * Essential modules refuse to be disabled; enabling is always allowed.
 */
export async function setModuleEnabled(
  name: string,
  enabled: boolean,
): Promise<CardReply> {
  try {
    const record = container.moduleStore.getRecord(name);
    if (!record) return moduleNotFoundCard(name);

    if (!enabled && !container.moduleStore.isModuleDisableable(name)) {
      return makeErrorCard(
        "Forbidden",
        `Module **${record.meta.displayName}** is essential and cannot be disabled.`,
      );
    }

    await container.moduleStore.setEnabled(name, enabled);
    return makeSuccessCard(
      enabled
        ? `${Emojis.CHECK} Enabled Module`
        : `${Emojis.CROSS} Disabled Module`,
      `Successfully ${enabled ? "enabled" : "disabled"} **${record.meta.displayName}** globally.`,
    );
  } catch (err: unknown) {
    return makeErrorCard("Action Failed", errorFrom(err).message);
  }
}

/**
 * Clones and loads a third-party module from a tracked repository.
 *
 * A collision with an existing checkout is not an error: the user is offered
 * the update flow instead.
 */
export async function installModule(
  repoName: string,
  moduleName: string,
  user: User,
): Promise<CardReply> {
  try {
    await downloader().installModule(repoName, moduleName);
    container.logger.debug(
      `[Module] ${Emojis.INSTALL} Installed: ${moduleName} from ${repoName} by ${user.tag}`,
    );
    return makeSuccessCard(
      `${Emojis.INSTALL} Module Installed`,
      `Successfully installed and loaded **${moduleName}** from **${repoName}**.`,
    );
  } catch (err: unknown) {
    if (err instanceof ModuleAlreadyInstalledError) {
      return moduleAlreadyInstalledCard(moduleName, user.id);
    }

    const message = errorFrom(err).message;
    container.logger.warn(
      `[Module] ${Emojis.ERROR} Install failed: ${moduleName} - ${message}`,
    );
    return makeErrorCard(`${Emojis.ERROR} Failed to Install Module`, message);
  }
}

export async function uninstallModule(
  moduleName: string,
  user: User,
): Promise<CardReply> {
  try {
    await downloader().uninstallModule(moduleName);
    container.logger.debug(
      `[Module] ${Emojis.UNINSTALL} Uninstalled: ${moduleName} by ${user.tag}`,
    );
    return makeSuccessCard(
      `${Emojis.UNINSTALL} Module Uninstalled`,
      `Successfully uninstalled **${moduleName}**.`,
    );
  } catch (err: unknown) {
    const message = errorFrom(err).message;
    container.logger.warn(
      `[Module] ${Emojis.ERROR} Uninstall failed: ${moduleName} - ${message}`,
    );
    return makeErrorCard(`${Emojis.ERROR} Failed to Uninstall Module`, message);
  }
}

/**
 * Re-evaluates a module's full source subtree and re-syncs the application
 * commands it contributes.
 */
export async function reloadModule(
  moduleName: string,
  userTag: string,
): Promise<CardReply> {
  try {
    await container.moduleStore.reload(moduleName);
    await downloader().syncApplicationCommands();
    container.logger.info(`[Module] Reloaded: ${moduleName} by ${userTag}`);
    return makeSuccessCard(
      `${Emojis.CHECK} Module Reloaded`,
      `**${moduleName}** has been reloaded. Its full source subtree was re-evaluated and slash commands (if any) re-synced.`,
    );
  } catch (err: unknown) {
    const message = errorFrom(err).message;
    container.logger.warn(`[Module] Reload failed: ${moduleName} - ${message}`);
    return makeErrorCard(`${Emojis.ERROR} Reload Failed`, message);
  }
}

/**
 * Pulls new code for a single installed module.
 *
 * @param userId - Scopes the restart prompt the result card may carry.
 */
export async function updateModule(
  moduleName: string,
  userId: string,
): Promise<CardReply> {
  try {
    const result = await downloader().updateModule(moduleName);
    return moduleUpdateResultCard(result, moduleName, userId);
  } catch (err: unknown) {
    return makeErrorCard(
      `${Emojis.ERROR} Update Failed`,
      errorFrom(err).message,
    );
  }
}

/**
 * Pulls new code for every module installed through the Downloader.
 *
 * A failure on one module never aborts the sweep - it is recorded and the run
 * continues, so the report card always covers every installed module.
 *
 * @param userId - Scopes the restart prompt the report card may carry.
 */
export async function updateAllModules(userId: string): Promise<CardReply> {
  try {
    const installed = await downloader().getInstalledModules();
    if (!installed.length) return noInstalledModulesCard();

    const outcomes: ModuleUpdateOutcome[] = [];
    for (const item of installed) {
      if (item.pinned) {
        outcomes.push({
          moduleName: item.moduleName,
          status: "skipped-pinned",
          needsRestart: false,
        });
        continue;
      }
      try {
        const result = await downloader().updateModule(item.moduleName);
        outcomes.push({
          moduleName: item.moduleName,
          status: result.updated ? "updated" : "up-to-date",
          needsRestart: result.needsRestart ?? false,
        });
      } catch (err: unknown) {
        outcomes.push({
          moduleName: item.moduleName,
          status: "failed",
          needsRestart: false,
          error: errorFrom(err).message,
        });
      }
    }

    return multiUpdateReportCard(outcomes, userId);
  } catch (err: unknown) {
    return makeErrorCard(
      `${Emojis.ERROR} Multi-Update Failed`,
      errorFrom(err).message,
    );
  }
}

/** Freezes a downloader-installed module against `,module update`/`updateall`. */
export async function pinModule(moduleName: string): Promise<CardReply> {
  try {
    await downloader().setModulePinned(moduleName, true);
    return modulePinnedCard(moduleName);
  } catch (err: unknown) {
    return makeErrorCard(
      `${Emojis.ERROR} Pin Failed`,
      errorFrom(err).message,
    );
  }
}

/** Removes the update lock set by {@linkcode pinModule}. */
export async function unpinModule(moduleName: string): Promise<CardReply> {
  try {
    await downloader().setModulePinned(moduleName, false);
    return moduleUnpinnedCard(moduleName);
  } catch (err: unknown) {
    return makeErrorCard(
      `${Emojis.ERROR} Unpin Failed`,
      errorFrom(err).message,
    );
  }
}
