import {
  ActionRowBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import {
  BrandColors,
  buildSafeActionRows,
  createActionButton,
  ephemeralCard,
  makeCard,
  makeInfoCard,
  makeErrorCard,
  makeSuccessCard,
  row,
  settingRow,
  type CardReply,
} from "@lumi/ui";
import type { ConfigService } from "../services/ConfigService.js";

export interface SettingsPanelOptions {
  configService: ConfigService;
  guildId: string;
  interaction: any;
}

const DefaultPrefix = "!";
const MaxPrefixLength = 5;
const PreviewLimit = 120;
const OtherSettingsLimit = 15;

const clip = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;

const readString = (value: unknown, fallback: string): string =>
  typeof value === "string" && value.length > 0 ? value : fallback;

const previewValue = (value: unknown): string => {
  const json = JSON.stringify(value);
  return clip(json ?? "null", PreviewLimit);
};

export class SettingsPanel {
  private configService: ConfigService;
  private guildId: string;
  private interaction: any;

  constructor(options: SettingsPanelOptions) {
    this.configService = options.configService;
    this.guildId = options.guildId;
    this.interaction = options.interaction;
  }

  async render(): Promise<void> {
    const card = ephemeralCard(await this.settingsCard());
    if (this.interaction.isButton?.() || this.interaction.isStringSelectMenu?.()) {
      await this.interaction.update(card);
      return;
    }
    await this.interaction.reply(card);
  }

  private async settingsCard(): Promise<CardReply> {
    const settings = await this.configService.getAll(this.guildId);
    const prefix = readString(settings.prefix, DefaultPrefix);
    const otherKeys = Object.keys(settings).filter((key) => key !== "prefix");

    const otherLines =
      otherKeys.length === 0
        ? ["-# No other settings stored."]
        : otherKeys
            .slice(0, OtherSettingsLimit)
            .map(
              (key) =>
                `• \`${key}\` = \`${previewValue(settings[key])}\``,
            );

    if (otherKeys.length > OtherSettingsLimit) {
      otherLines.push(
        `-# ...and ${otherKeys.length - OtherSettingsLimit} more key(s).`,
      );
    }

    const sections = [
      settingRow(
        [
          "**Prefix**",
          `-# Current value: \`${prefix}\``,
        ],
        {
          customId: "settings_edit:prefix",
          label: "Edit",
          style: ButtonStyle.Primary,
          emoji: "✏️",
        },
      ),
    ];

    return makeCard(
      BrandColors.info,
      "Guild Settings",
      ["**Other settings**", ...otherLines],
      {
        subtitle: "Edit the command prefix for this server",
        breadcrumbs: ["Admin", "Settings"],
        sections,
        divider: true,
        actionRows: buildSafeActionRows([
          row(
            createActionButton({
              customId: "settings_reset:prefix",
              label: "Reset Prefix",
              style: ButtonStyle.Secondary,
              emoji: "↩️",
            }),
            createActionButton({
              customId: "settings_refresh",
              label: "Refresh",
              style: ButtonStyle.Secondary,
              emoji: "🔄",
            }),
            createActionButton({
              customId: "settings_back",
              label: "Close",
              style: ButtonStyle.Danger,
              emoji: "✖️",
            }),
          ),
        ]),
        footer: `${Object.keys(settings).length} stored setting(s)`,
        separatorAboveActionRows: true,
      },
    );
  }

  private async showEditModal(): Promise<void> {
    const settings = await this.configService.getAll(this.guildId);
    const current = readString(settings.prefix, DefaultPrefix);

    const modal = new ModalBuilder()
      .setCustomId("settings_edit_modal:prefix")
      .setTitle("Edit Command Prefix");

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("value")
          .setLabel("Prefix")
          .setStyle(TextInputStyle.Short)
          .setValue(clip(current, 100))
          .setPlaceholder("!")
          .setRequired(true)
          .setMaxLength(MaxPrefixLength),
      ),
    );

    await this.interaction.showModal(modal);
  }

  async handleInteraction(interaction: any): Promise<void> {
    this.interaction = interaction;
    const customId: string = interaction.customId;

    if (customId === "settings_back") {
      await interaction.update(
        ephemeralCard(
          makeInfoCard("Settings", "Settings panel closed.", {
            footer: "Run `/lumi` to reopen",
          }),
        ),
      );
      return;
    }

    if (customId === "settings_refresh") {
      await interaction.update(await this.settingsCard());
      return;
    }

    if (customId.startsWith("settings_edit:")) {
      const key = customId.split(":")[1];
      if (key === "prefix") {
        await this.showEditModal();
      }
      return;
    }

    if (customId.startsWith("settings_reset:")) {
      const key = customId.split(":")[1];
      if (key !== "prefix") return;

      try {
        await this.configService.reset(this.guildId, key);
        await interaction.update(await this.settingsCard());
        await interaction.followUp(
          ephemeralCard(
            makeSuccessCard(
              "Setting Reset",
              `Cleared the stored \`${key}\` value.`,
            ),
          ),
        );
      } catch (error: any) {
        await interaction.followUp(
          ephemeralCard(
            makeErrorCard(
              "Reset Failed",
              `Could not reset \`${key}\`: ${error.message}`,
            ),
          ),
        );
      }
    }
  }

  async handleModalSubmit(interaction: any): Promise<void> {
    this.interaction = interaction;
    const customId: string = interaction.customId;

    if (!customId.startsWith("settings_edit_modal:")) return;

    const key = customId.split(":")[1];
    if (key !== "prefix") return;

    const raw = interaction.fields.getTextInputValue("value").trim();

    if (raw.length === 0 || raw.length > MaxPrefixLength || /\s/.test(raw)) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Invalid Prefix",
            `Prefix must be between 1 and ${MaxPrefixLength} characters with no spaces.`,
          ),
        ),
      );
      return;
    }

    try {
      await this.configService.set(this.guildId, key, raw);
      await interaction.editReply(await this.settingsCard());
      await interaction.followUp(
        ephemeralCard(
          makeSuccessCard(
            "Setting Updated",
            `Saved \`${key}\` as \`${raw}\`.`,
          ),
        ),
      );
    } catch (error: any) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Update Failed",
            `Could not save \`${key}\`: ${error.message}`,
          ),
        ),
      );
    }
  }
}
