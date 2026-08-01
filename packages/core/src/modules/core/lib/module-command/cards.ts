import type { ModuleRecord } from "#lib/module-system/ModuleStore.js";
import { restartChoiceRow } from "#lib/restart.js";
import { Emojis } from "#lib/utilities/assets.js";
import {
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
  makeWarningCard,
  type CardReply,
} from "#lib/utilities/cards.js";
import type { ModulePiecesInfo } from "#modules/core/lib/module-command/pieces.js";
import { ActionRowBuilder, ButtonBuilder } from "@discordjs/builders";
import { ButtonStyle } from "discord.js";

/** Maps a module's runtime state to its status indicator emoji. */
function stateEmoji(state: string | undefined): string {
  if (state === "loaded") return Emojis.SUCCESS;
  if (state === "failed") return Emojis.WARNING;
  return Emojis.CROSS;
}

export function noModulesDiscoveredCard(): CardReply {
  return makeInfoCard("Modules", "No modules discovered.");
}

/**
 * Renders one paginator entry per module, sorted by name. Each entry is two
 * markdown lines: the heading and the status line.
 */
export function moduleListEntries(records: readonly ModuleRecord[]): string[] {
  return [...records]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((record) => {
      const globalStatus = record.enabled ? "Enabled" : "Disabled";
      const stateLabel = record.state ? `[${record.state}]` : "";
      const isCoreLabel = record.name === "core" ? " (Core)" : " (Addon)";
      const statusEmoji = stateEmoji(record.state);
      return `${statusEmoji} **${record.meta.emoji} ${record.meta.displayName}** (\`${record.name}\` v${record.meta.version})${isCoreLabel}\n  - Status: ${globalStatus} ${stateLabel}${record.failureReason ? ` (Error: ${record.failureReason})` : ""}`;
    });
}

export function moduleNotFoundCard(name: string): CardReply {
  return makeErrorCard("Not Found", `Module **${name}** was not discovered.`);
}

/** The `/module info` detail card: metadata, config fields and loaded pieces. */
export function moduleInfoCard(
  record: ModuleRecord,
  pieces: ModulePiecesInfo,
): CardReply {
  const description = record.meta.description || "No description provided.";
  const isCoreLabel = record.name === "core" ? "Yes (Core)" : "No (Addon)";
  const globalStatus = record.enabled ? "Enabled" : "Disabled";
  const stateLabel = record.state ? `${record.state}` : "unknown";
  const statusEmoji = stateEmoji(record.state);

  const detailLines = [
    `**Display Name:** ${record.meta.displayName}`,
    `**Version:** \`v${record.meta.version}\``,
    `**Core Module:** ${isCoreLabel}`,
    `**Global Toggle:** ${globalStatus}`,
    `**Runtime Status:** ${statusEmoji} \`${stateLabel}\``,
  ];

  if (record.failureReason) {
    detailLines.push(`**Failure Reason:** \`${record.failureReason}\``);
  }

  detailLines.push(
    `**Dependencies:** ${record.meta.dependencies?.length ? record.meta.dependencies.map((d) => `\`${d}\``).join(", ") : "None"}`,
    `**Conflicts:** ${record.meta.conflicts?.length ? record.meta.conflicts.map((c) => `\`${c}\``).join(", ") : "None"}`,
  );

  if (record.meta.configFields?.length) {
    detailLines.push(
      `**Config Fields:**`,
      ...record.meta.configFields.map(
        (f) => `  - \`${f.key}\` (${f.type}): *${f.description || f.label}*`,
      ),
    );
  }

  detailLines.push(`**Registered Pieces:** ${pieces.totalPieces} total`);

  for (const [storeName, names] of Object.entries(pieces.piecesByStore)) {
    detailLines.push(
      `- **${storeName}:** ${names.map((p) => `\`${p}\``).join(", ")}`,
    );
  }

  return makeInfoCard(
    `${record.meta.emoji} Module: ${record.meta.displayName} (${record.name})`,
    [`*${description}*`, detailLines.join("\n")].join("\n\n"),
  );
}

export function installProgressCard(
  repoName: string,
  moduleName: string,
): CardReply {
  return makeInfoCard(
    "Installing Module",
    `Installing **${moduleName}** from **${repoName}**...`,
  );
}

/**
 * Offered when an install collides with an existing checkout: the button hands
 * the user straight to the update flow, scoped to the invoker.
 */
export function moduleAlreadyInstalledCard(
  moduleName: string,
  userId: string,
): CardReply {
  const updateRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`module:update:${moduleName}:${userId}`)
      .setLabel("Update Module")
      .setEmoji(Emojis.parse(Emojis.DOWNLOAD))
      .setStyle(ButtonStyle.Primary),
  );

  return makeWarningCard(
    `${Emojis.WARNING} Already Installed`,
    `**${moduleName}** is already installed. Would you like to update it instead?`,
    { actionRows: [updateRow] },
  );
}

export function uninstallProgressCard(moduleName: string): CardReply {
  return makeInfoCard(
    "Uninstalling Module",
    `Uninstalling **${moduleName}**...`,
  );
}

export function reloadProgressCard(moduleName: string): CardReply {
  return makeInfoCard(
    "Reloading Module",
    `${Emojis.LOADING} Unloading and reloading **${moduleName}**...`,
  );
}

export function updateProgressCard(moduleName: string): CardReply {
  return makeInfoCard(
    "Updating Module",
    `${Emojis.LOADING} Checking and downloading updates for **${moduleName}**...`,
  );
}

export function updateAllProgressCard(): CardReply {
  return makeInfoCard(
    "Updating All Modules",
    `${Emojis.LOADING} Scanning and updating all installed modules...`,
  );
}

export function noInstalledModulesCard(): CardReply {
  return makeWarningCard(
    "No Modules Installed",
    "You have not installed any third-party modules via the Downloader.",
  );
}

export interface ModuleUpdateOutcome {
  moduleName: string;
  status: "updated" | "up-to-date" | "failed";
  /** Only meaningful when `status` is `"updated"`. */
  needsRestart: boolean;
  /** Failure message, present only when `status` is `"failed"`. */
  error?: string;
}

/**
 * The `/module update` (no argument) report. Outcomes keep their input order
 * within each section. When any module landed new code on disk the card also
 * carries the restart prompt, since one restart applies every update.
 */
export function multiUpdateReportCard(
  outcomes: readonly ModuleUpdateOutcome[],
  userId: string,
): CardReply {
  const succeeded = outcomes
    .filter((outcome) => outcome.status === "updated")
    .map(
      (outcome) =>
        `${Emojis.SUCCESS} **${outcome.moduleName}**${outcome.needsRestart ? "" : " (hot-reloaded)"}`,
    );
  const skipped = outcomes
    .filter((outcome) => outcome.status === "up-to-date")
    .map((outcome) => `- **${outcome.moduleName}** (up-to-date)`);
  const failed = outcomes
    .filter((outcome) => outcome.status === "failed")
    .map(
      (outcome) =>
        `${Emojis.ERROR} **${outcome.moduleName}** - ${outcome.error}`,
    );
  const needsRestart = outcomes.some(
    (outcome) => outcome.status === "updated" && outcome.needsRestart,
  );

  const report: string[] = [];
  if (succeeded.length > 0)
    report.push(`### Updated:\n${succeeded.join("\n")}`);
  if (skipped.length > 0) report.push(`### Up-To-Date:\n${skipped.join("\n")}`);
  if (failed.length > 0) report.push(`### Failed:\n${failed.join("\n")}`);
  if (needsRestart) {
    report.push(
      "_New code is on disk. A restart is needed to load it; one restart applies every updated module._",
    );
  }

  return makeSuccessCard("Multi-Module Update Report", report.join("\n\n"), {
    actionRows: needsRestart ? [restartChoiceRow(userId)] : undefined,
  });
}

/** The `/module help` overview, with shortcuts into the hub panel tabs. */
export function moduleHelpCard(): CardReply {
  const panelRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("lumi:tab:modules")
      .setLabel("Open Modules Panel")
      .setEmoji(Emojis.parse(Emojis.GEAR))
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("lumi:tab:addons")
      .setLabel("Open Add-ons Manager")
      .setEmoji(Emojis.parse(Emojis.REPO))
      .setStyle(ButtonStyle.Secondary),
  );

  return makeInfoCard(
    "Module Management Commands",
    [
      "Tip: if you prefer buttons and menus, use the panel buttons below.",
      "",
      "**Global & Local Module Commands:**",
      "- `,module list` or `/module list` - List all discovered modules and their status.",
      "- `,module info <name>` or `/module info <name>` - Show detailed info and registered pieces.",
      "- `,module enable <name>` or `/module enable <name>` - Enable a module globally.",
      "- `,module disable <name>` or `/module disable <name>` - Disable a module globally.",
      "- `,module reload <name>` or `/module reload <name>` - Reload a module's source code dynamically.",
      "",
      "**Downloader Commands (Addons):**",
      "- `,module install <repo> <module>` or `/module install` - Install a module from a repo.",
      "- `,module uninstall <module>` or `/module uninstall` - Uninstall a downloader module.",
      "- `,module update [module]` or `/module update` - Update an installed module (or all).",
    ].join("\n"),
    { actionRows: [panelRow] },
  );
}
