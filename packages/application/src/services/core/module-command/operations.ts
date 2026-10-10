import { moduleUpdateResultCard } from "@lumi/modules/core/ui/module-update-card.js";
import { getUtility } from "@lumi/lib/module-system/utility.js";
import {
  ModuleAlreadyInstalledError,
  type DownloaderUtility,
} from "@lumi/modules/core/utilities/DownloaderUtility.js";
import { makeErrorCard, makeSuccessCard, type CardReply } from "@lumi/lib/ui/cards.js";
import { errorFrom } from "@lumi/lib/utilities/errors.js";
import {
  moduleAlreadyInstalledCard,
  moduleNotFoundCard,
  modulePinnedCard,
  moduleUnpinnedCard,
  multiUpdateReportCard,
  noInstalledModulesCard,
  type ModuleUpdateOutcome,
} from "@lumi/modules/core/ui/module-command-cards.js";
import { container } from "@lumi/lib/services.js";
import type { User } from "discord.js";

function downloader(): DownloaderUtility {
  return getUtility("downloader");
}

/** Essential modules refuse to be disabled; enabling is always allowed. */
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
        ? `✅ Enabled Module`
        : `❌ Disabled Module`,
      `Successfully ${enabled ? "enabled" : "disabled"} **${record.meta.displayName}** globally.`,
    );
  } catch (err: unknown) {
    return makeErrorCard("Action Failed", errorFrom(err).message);
  }
}

/** A collision with an existing checkout is not an error: the user is offered the update flow instead. */
export async function installModule(
  repoName: string,
  moduleName: string,
  user: User,
): Promise<CardReply> {
  try {
    const { signatureWarning } = await downloader().installModule(container, repoName, moduleName);
    container.logger.debug(
      `[Module] 🔧 Installed: ${moduleName} from ${repoName} by ${user.tag}`,
    );
    const body = [
      `Successfully installed and loaded **${moduleName}** from **${repoName}**.`,
      signatureWarning ? `🔴 Signature warning: ${signatureWarning}.` : null,
    ]
      .filter(Boolean)
      .join("\n\n");
    return makeSuccessCard(`🔧 Module Installed`, body);
  } catch (err: unknown) {
    if (err instanceof ModuleAlreadyInstalledError) {
      return moduleAlreadyInstalledCard(moduleName, user.id);
    }

    const message = errorFrom(err).message;
    container.logger.warn(
      `[Module] 🔴 Install failed: ${moduleName} - ${message}`,
    );
    return makeErrorCard(`🔴 Failed to Install Module`, message);
  }
}

export async function uninstallModule(
  moduleName: string,
  user: User,
): Promise<CardReply> {
  try {
    await downloader().uninstallModule(container, moduleName);
    container.logger.debug(
      `[Module] 🗑️ Uninstalled: ${moduleName} by ${user.tag}`,
    );
    return makeSuccessCard(
      `🗑️ Module Uninstalled`,
      `Successfully uninstalled **${moduleName}**.`,
    );
  } catch (err: unknown) {
    const message = errorFrom(err).message;
    container.logger.warn(
      `[Module] 🔴 Uninstall failed: ${moduleName} - ${message}`,
    );
    return makeErrorCard(`🔴 Failed to Uninstall Module`, message);
  }
}

export async function reloadModule(
  moduleName: string,
  userTag: string,
): Promise<CardReply> {
  try {
    await container.moduleStore.reload(moduleName);
    await downloader().syncApplicationCommands(container);
    container.logger.info(`[Module] Reloaded: ${moduleName} by ${userTag}`);
    return makeSuccessCard(
      `✅ Module Reloaded`,
      `**${moduleName}** has been reloaded. Its full source subtree was re-evaluated and slash commands (if any) re-synced.`,
    );
  } catch (err: unknown) {
    const message = errorFrom(err).message;
    container.logger.warn(`[Module] Reload failed: ${moduleName} - ${message}`);
    return makeErrorCard(`🔴 Reload Failed`, message);
  }
}

export async function updateModule(
  moduleName: string,
  userId: string,
): Promise<CardReply> {
  try {
    const result = await downloader().updateModule(container, moduleName);
    return moduleUpdateResultCard(result, moduleName, userId);
  } catch (err: unknown) {
    return makeErrorCard(
      `🔴 Update Failed`,
      errorFrom(err).message,
    );
  }
}

/** A failure on one module never aborts the sweep - it is recorded and the run continues. */
export async function updateAllModules(userId: string): Promise<CardReply> {
  try {
    const installed = await downloader().getInstalledModules(container);
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
        const result = await downloader().updateModule(container, item.moduleName);
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
      `🔴 Multi-Update Failed`,
      errorFrom(err).message,
    );
  }
}

/** Freezes a downloader-installed module against `,module update`/`updateall`. */
export async function pinModule(moduleName: string): Promise<CardReply> {
  try {
    await downloader().setModulePinned(container, moduleName, true);
    return modulePinnedCard(moduleName);
  } catch (err: unknown) {
    return makeErrorCard(
      `🔴 Pin Failed`,
      errorFrom(err).message,
    );
  }
}

/** Removes the update lock set by {@linkcode pinModule}. */
export async function unpinModule(moduleName: string): Promise<CardReply> {
  try {
    await downloader().setModulePinned(container, moduleName, false);
    return moduleUnpinnedCard(moduleName);
  } catch (err: unknown) {
    return makeErrorCard(
      `🔴 Unpin Failed`,
      errorFrom(err).message,
    );
  }
}
