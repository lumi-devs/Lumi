import { makeSuccessCard, type CardReply } from "#src/lib/ui/Cards.js";
import { restartChoiceRow } from "#src/lib/Restart.js";

interface ModuleUpdateResult {
  updated: boolean;
  changelog?: string;
  needsRestart?: boolean;
  pinned?: boolean;
}

export function moduleUpdateResultCard(
  result: ModuleUpdateResult,
  moduleName: string,
  userId: string,
): CardReply {
  if (result.pinned) {
    return makeSuccessCard(
      `📌 Module Pinned`,
      `**${moduleName}** is pinned and was skipped. Run \`,module unpin ${moduleName}\` first if you want to update it.`,
    );
  }

  if (!result.updated) {
    return makeSuccessCard(
      `✅ Module Up-To-Date`,
      `**${moduleName}** is already running the latest version!`,
    );
  }

  const changelogStr = result.changelog
    ? `### Pull Changelog:\n\`\`\`git\n${result.changelog}\n\`\`\``
    : "No changelog details provided.";

  if (result.needsRestart) {
    return makeSuccessCard(
      `📥 Module Updated`,
      `Updated **${moduleName}** on disk. Bun can't hot-swap module code, so a restart is needed to load it.\n\n${changelogStr}`,
      { actionRows: [restartChoiceRow(userId)] },
    );
  }

  return makeSuccessCard(
    `📥 Module Updated`,
    `Successfully updated and hot-reloaded **${moduleName}**!\n\n${changelogStr}`,
  );
}
