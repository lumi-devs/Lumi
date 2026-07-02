import { makeSuccessCard, type CardReply } from "#utilities/cards.js";
import { Emojis } from "#utilities/assets.js";
import { restartChoiceRow } from "#core/lib/restart.js";

export interface ModuleUpdateResult {
  updated: boolean;
  changelog?: string;
  needsRestart?: boolean;
}

/**
 * The result card shown after a single-module update — shared by the `/module
 * update` command and the "Update Module" button so both render identically.
 */
export function moduleUpdateResultCard(
  result: ModuleUpdateResult,
  moduleName: string,
  userId: string,
): CardReply {
  if (!result.updated) {
    return makeSuccessCard(
      `${Emojis.CHECK} Module Up-To-Date`,
      `**${moduleName}** is already running the latest version!`,
    );
  }

  const changelogStr = result.changelog
    ? `### Pull Changelog:\n\`\`\`git\n${result.changelog}\n\`\`\``
    : "No changelog details provided.";

  if (result.needsRestart) {
    return makeSuccessCard(
      `${Emojis.DOWNLOAD} Module Updated`,
      `Updated **${moduleName}** on disk. Bun can't hot-swap module code, so a restart is needed to load it.\n\n${changelogStr}`,
      { actionRows: [restartChoiceRow(userId)] },
    );
  }

  return makeSuccessCard(
    `${Emojis.DOWNLOAD} Module Updated`,
    `Successfully updated and hot-reloaded **${moduleName}**!\n\n${changelogStr}`,
  );
}
