import { moduleUpdateResultCard } from "#src/admin/ui/ModuleUpdateCard.js";
import { getUtility } from "#src/lib/module-system/Utility.js";
import {
  ModuleAlreadyInstalledError,
  type DownloaderUtility,
} from "#src/admin/utilities/DownloaderUtility.js";
import { makeErrorCard, makeSuccessCard, type CardReply } from "#src/lib/ui/Cards.js";
import { errorFrom } from "#src/lib/utilities/Errors.js";
import {
  moduleAlreadyInstalledCard,
  moduleNotFoundCard,
  modulePinnedCard,
  moduleUnpinnedCard,
  multiUpdateReportCard,
  noInstalledModulesCard,
  type ModuleUpdateOutcome,
} from "#src/admin/ui/ModuleCommandCards.js";
import { container } from "#src/lib/Services.js";
import type { User } from "discord.js";

function downloader(): DownloaderUtility {
  return getUtility("downloader");
}

function failCard(title: string, err: unknown, context?: string): CardReply {
  const message = errorFrom(err).message;
  if (context) container.logger.warn(`[Module] ${context} - ${message}`);
  return makeErrorCard(title, message);
}

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
    return failCard("Action Failed", err);
  }
}

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
    return failCard(`🔴 Failed to Install Module`, err, `🔴 Install failed: ${moduleName}`);
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
    return failCard(`🔴 Failed to Uninstall Module`, err, `🔴 Uninstall failed: ${moduleName}`);
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
    return failCard(`🔴 Reload Failed`, err, `Reload failed: ${moduleName}`);
  }
}

export async function loadModuleOnce(
  moduleName: string,
  userTag: string,
): Promise<CardReply> {
  try {
    const record = container.moduleStore.getRecord(moduleName);
    if (!record) return moduleNotFoundCard(moduleName);
    await container.moduleStore.loadModule(moduleName, true);
    await downloader().syncApplicationCommands(container);
    container.logger.info(`[Module] Loaded: ${moduleName} by ${userTag}`);
    return makeSuccessCard(
      `✅ Module Loaded`,
      `**${moduleName}** is now loaded for this session. Use \`module enable\` to persist it across restarts.`,
    );
  } catch (err: unknown) {
    return failCard(`🔴 Load Failed`, err, `Load failed: ${moduleName}`);
  }
}

export async function unloadModuleOnce(
  moduleName: string,
  userTag: string,
): Promise<CardReply> {
  try {
    const record = container.moduleStore.getRecord(moduleName);
    if (!record) return moduleNotFoundCard(moduleName);
    if (!container.moduleStore.isModuleDisableable(moduleName)) {
      return makeErrorCard(
        "Forbidden",
        `Module **${record.meta.displayName}** is essential and cannot be unloaded.`,
      );
    }
    await container.moduleStore.unload(moduleName);
    await downloader().syncApplicationCommands(container);
    container.logger.info(`[Module] Unloaded: ${moduleName} by ${userTag}`);
    return makeSuccessCard(
      `✅ Module Unloaded`,
      `**${moduleName}** is now unloaded for this session. Use \`module disable\` to persist it across restarts.`,
    );
  } catch (err: unknown) {
    return failCard(`🔴 Unload Failed`, err, `Unload failed: ${moduleName}`);
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
    return failCard(`🔴 Update Failed`, err);
  }
}

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
    return failCard(`🔴 Multi-Update Failed`, err);
  }
}

export async function pinModule(moduleName: string): Promise<CardReply> {
  try {
    await downloader().setModulePinned(container, moduleName, true);
    return modulePinnedCard(moduleName);
  } catch (err: unknown) {
    return failCard(`🔴 Pin Failed`, err);
  }
}

export async function unpinModule(moduleName: string): Promise<CardReply> {
  try {
    await downloader().setModulePinned(container, moduleName, false);
    return moduleUnpinnedCard(moduleName);
  } catch (err: unknown) {
    return failCard(`🔴 Unpin Failed`, err);
  }
}
