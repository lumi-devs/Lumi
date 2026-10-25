import { ButtonStyle } from "discord.js";
import {
  BrandColors,
  buildSafeActionRows,
  createActionButton,
  createPaginationRow,
  createStringSelectMenu,
  ephemeralCard,
  formatPageFooter,
  makeCard,
  makeEmptyCard,
  makeInfoCard,
  makeErrorCard,
  makeSuccessCard,
  row,
  settingRow,
  type CardReply,
} from "@lumi/ui";
import type { ModuleManager } from "../services/ModuleManager.js";

export interface ModulePanelOptions {
  moduleManager: ModuleManager;
  guildId: string;
  interaction: any;
}

interface ModuleRow {
  name: string;
  displayName: string;
  emoji: string;
  description: string;
  enabled: boolean;
}

const ModulePageSize = 5;
const SelectOptionLimit = 25;
const ConfigPreviewLimit = 900;

const clip = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;

const parseNameAndPage = (
  customId: string,
  prefix: string,
): { name: string; page: number } => {
  const rest = customId.slice(prefix.length);
  const separator = rest.lastIndexOf(":");
  if (separator === -1) return { name: rest, page: 0 };
  const page = Number(rest.slice(separator + 1));
  return {
    name: rest.slice(0, separator),
    page: Number.isNaN(page) ? 0 : page,
  };
};

export class ModulePanel {
  private moduleManager: ModuleManager;
  private guildId: string;
  private interaction: any;

  constructor(options: ModulePanelOptions) {
    this.moduleManager = options.moduleManager;
    this.guildId = options.guildId;
    this.interaction = options.interaction;
  }

  async render(page = 0): Promise<void> {
    const card = ephemeralCard(await this.listCard(page));
    if (this.interaction.isButton?.() || this.interaction.isStringSelectMenu?.()) {
      await this.interaction.update(card);
      return;
    }
    await this.interaction.reply(card);
  }

  private async listCard(page: number): Promise<CardReply> {
    const modules = (await this.moduleManager.list(
      this.guildId,
    )) as ModuleRow[];

    if (modules.length === 0) {
      return makeEmptyCard(
        "No modules installed",
        "No modules are available to this bot instance.",
        "Install a module or addon, then refresh this panel.",
        {
          breadcrumbs: ["Admin", "Modules"],
          footer: "0 modules",
        },
      );
    }

    const enabledCount = modules.filter((module) => module.enabled).length;
    const totalPages = Math.max(1, Math.ceil(modules.length / ModulePageSize));
    const currentPage = Math.min(Math.max(page, 0), totalPages - 1);
    const start = currentPage * ModulePageSize;
    const visible = modules.slice(start, start + ModulePageSize);

    const sections = visible.map((module) =>
      settingRow(
        [
          `**${module.emoji} ${module.displayName}** \`${module.name}\``,
          `-# ${module.enabled ? "🟢 Enabled" : "🔴 Disabled"} · ${clip(module.description || "No description", 160)}`,
        ],
        {
          customId: `module_toggle:${currentPage}:${module.name}`,
          label: module.enabled ? "Disable" : "Enable",
          style: module.enabled ? ButtonStyle.Danger : ButtonStyle.Success,
          emoji: module.enabled ? "⏹️" : "▶️",
        },
      ),
    );

    const selectOptions = visible.slice(0, SelectOptionLimit).map((module) => ({
      label: clip(`${module.emoji} ${module.displayName}`, 100),
      value: module.name,
      description: clip(
        `${module.enabled ? "Enabled" : "Disabled"} · ${module.description || "No description"}`,
        100,
      ),
      emoji: module.enabled ? "🟢" : "🔴",
    }));

    const actionRows = buildSafeActionRows([
      row(
        createStringSelectMenu({
          customId: `module_select:${currentPage}`,
          placeholder: "Open module details",
          options: selectOptions,
        }),
      ),
      row(
        createActionButton({
          customId: `module_refresh:${currentPage}`,
          label: "Refresh",
          style: ButtonStyle.Secondary,
          emoji: "🔄",
        }),
        createActionButton({
          customId: "module_back",
          label: "Close",
          style: ButtonStyle.Danger,
          emoji: "✖️",
        }),
      ),
      ...(totalPages > 1
        ? [
            createPaginationRow({
              customIdPrefix: "module_page",
              currentPage,
              totalPages,
            }),
          ]
        : []),
    ]);

    return makeCard(
      BrandColors.purple,
      "Module Management",
      "-# Toggle a module with its button, or select one for details and configuration.",
      {
        subtitle: `${enabledCount} of ${modules.length} modules enabled on this server`,
        breadcrumbs: ["Admin", "Modules"],
        sections,
        footer: formatPageFooter(currentPage, totalPages, `${enabledCount} enabled`),
        actionRows,
        separatorAboveActionRows: true,
      },
    );
  }

  private async detailCard(name: string, page: number): Promise<CardReply> {
    const modules = (await this.moduleManager.list(
      this.guildId,
    )) as ModuleRow[];
    const module = modules.find((entry) => entry.name === name);

    if (!module) {
      return makeErrorCard("Module Not Found", `No module named \`${name}\`.`);
    }

    const config = await this.moduleManager.getConfig(this.guildId, name);
    const configBody =
      Object.keys(config).length === 0
        ? "-# No module configuration stored."
        : `**Configuration**\n\`\`\`json\n${clip(
            JSON.stringify(config, null, 2),
            ConfigPreviewLimit,
          )}\n\`\`\``;

    return makeCard(
      module.enabled ? BrandColors.success : BrandColors.error,
      module.name,
      [
        module.description || "No description provided.",
        `**Status** ${module.enabled ? "🟢 Enabled" : "🔴 Disabled"}`,
        configBody,
      ],
      {
        subtitle: module.enabled ? "Enabled on this server" : "Disabled on this server",
        breadcrumbs: ["Admin", "Modules", module.name],
        actionRows: buildSafeActionRows([
          row(
            createActionButton({
              customId: `module_toggle:${page}:${module.name}`,
              label: module.enabled ? "Disable" : "Enable",
              style: module.enabled ? ButtonStyle.Danger : ButtonStyle.Success,
              emoji: module.enabled ? "⏹️" : "▶️",
            }),
            createActionButton({
              customId: `module_reload:${module.name}:${page}`,
              label: "Reload",
              style: ButtonStyle.Primary,
              emoji: "♻️",
            }),
            createActionButton({
              customId: `module_back_list:${page}`,
              label: "Back to List",
              style: ButtonStyle.Secondary,
              emoji: "⬅️",
            }),
          ),
        ]),
        footer: "Module changes apply immediately",
      },
    );
  }

  async handleInteraction(interaction: any): Promise<void> {
    this.interaction = interaction;
    const customId: string = interaction.customId;

    if (customId === "module_back") {
      await interaction.update(
        ephemeralCard(
          makeInfoCard("Modules", "Module panel closed.", {
            footer: "Run `/lumi` to reopen",
          }),
        ),
      );
      return;
    }

    if (customId.startsWith("module_page:")) {
      const [, direction, rawPage] = customId.split(":");
      if (direction === "prev" || direction === "next") {
        const page = Number(rawPage);
        await interaction.update(
          await this.listCard(Number.isNaN(page) ? 0 : page),
        );
      }
      return;
    }

    if (customId.startsWith("module_refresh")) {
      const page = Number(customId.split(":")[1] ?? 0);
      await interaction.update(
        await this.listCard(Number.isNaN(page) ? 0 : page),
      );
      return;
    }

    if (customId.startsWith("module_back_list:")) {
      const page = Number(customId.split(":")[1] ?? 0);
      await interaction.update(
        await this.listCard(Number.isNaN(page) ? 0 : page),
      );
      return;
    }

    if (customId.startsWith("module_toggle:")) {
      const [, rawPage, ...nameParts] = customId.split(":");
      const page = Number(rawPage);
      const name = nameParts.join(":");
      const modules = (await this.moduleManager.list(
        this.guildId,
      )) as ModuleRow[];
      const module = modules.find((entry) => entry.name === name);

      if (!module) {
        await interaction.followUp(
          ephemeralCard(
            makeErrorCard("Module Not Found", `No module named \`${name}\`.`),
          ),
        );
        return;
      }

      try {
        if (module.enabled) {
          await this.moduleManager.disable(this.guildId, name);
        } else {
          await this.moduleManager.enable(this.guildId, name);
        }

        await interaction.update(
          await this.listCard(Number.isNaN(page) ? 0 : page),
        );
        await interaction.followUp(
          ephemeralCard(
            makeSuccessCard(
              module.enabled ? "Module Disabled" : "Module Enabled",
              `**${name}** is now ${module.enabled ? "disabled" : "enabled"} on this server.`,
            ),
          ),
        );
      } catch (error: any) {
        await interaction.followUp(
          ephemeralCard(
            makeErrorCard(
              "Module Update Failed",
              `Could not update **${name}**: ${error.message}`,
            ),
          ),
        );
      }
      return;
    }

    if (customId.startsWith("module_reload:")) {
      const { name, page } = parseNameAndPage(customId, "module_reload:");

      try {
        await this.moduleManager.reload(name);
        await interaction.update(await this.detailCard(name, page));
        await interaction.followUp(
          ephemeralCard(
            makeSuccessCard("Module Reloaded", `Reloaded **${name}**.`),
          ),
        );
      } catch (error: any) {
        await interaction.followUp(
          ephemeralCard(
            makeErrorCard(
              "Reload Failed",
              `Could not reload **${name}**: ${error.message}`,
            ),
          ),
        );
      }
    }
  }

  async handleSelectMenu(interaction: any): Promise<void> {
    this.interaction = interaction;
    const customId: string = interaction.customId;

    if (customId.startsWith("module_select:")) {
      const page = Number(customId.split(":")[1] ?? 0);
      const name: string = interaction.values[0] ?? "";
      if (!name) return;
      await interaction.update(
        await this.detailCard(name, Number.isNaN(page) ? 0 : page),
      );
    }
  }
}
