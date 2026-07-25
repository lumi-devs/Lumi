import {
  ActionRowBuilder,
  ButtonBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type MessageActionRowComponentBuilder,
} from "@discordjs/builders";
import { ButtonStyle } from "discord.js";
import {
  channelMention,
  roleMention,
  userMention,
} from "@discordjs/formatters";
import { makeCard, noPingCard, type CardReply } from "#lib/utilities/cards.js";
import { Emojis } from "#lib/utilities/assets.js";
import { SUPPORTED_LANGUAGES } from "#lib/i18n/index.js";

export const DEFAULT_PREFIX = ",";

type Row = ActionRowBuilder<MessageActionRowComponentBuilder>;

const row = (...components: MessageActionRowComponentBuilder[]): Row =>
  new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    ...components,
  );

export function hubRow(): Row {
  return row(
    new ButtonBuilder()
      .setCustomId("lumi:tab:modules")
      .setLabel("Modules")
      .setEmoji(Emojis.parse(Emojis.GEAR))
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("lumi:tab:permissions")
      .setLabel("Permissions")
      .setEmoji(Emojis.parse(Emojis.SHIELD))
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("lumi:tab:settings")
      .setLabel("Settings")
      .setEmoji(Emojis.parse(Emojis.GUILD))
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("lumi:tab:addons")
      .setLabel("Addons")
      .setEmoji(Emojis.parse(Emojis.REPO))
      .setStyle(ButtonStyle.Primary),
  );
}

export function backToHubRow(): Row {
  return row(
    new ButtonBuilder()
      .setCustomId("lumi:home")
      .setLabel("Back to Hub")
      .setEmoji(Emojis.parse(Emojis.ARROW_LEFT))
      .setStyle(ButtonStyle.Secondary),
  );
}

export interface HubOverview {
  moduleCount: number;
  enabledCount: number;
  prefix: string | null;
  locale: string;
}

export function buildHubView(o: HubOverview): CardReply {
  const glance = [
    `${Emojis.GEAR} **${o.enabledCount}** of **${o.moduleCount}** modules enabled`,
    `${Emojis.GUILD} Language \`${o.locale}\`  •  Prefix \`${o.prefix ?? DEFAULT_PREFIX}\``,
  ].join("\n");

  const tabs = [
    `${Emojis.GEAR} **Modules** — enable, disable, and configure every feature`,
    `${Emojis.SHIELD} **Permissions** — per-command allow / deny overrides`,
    `${Emojis.GUILD} **Settings** — server language and command prefix`,
    `${Emojis.REPO} **Addons** — extend Lumi with add-on modules`,
  ].join("\n");

  return makeCard(
    0,
    `${Emojis.BOT} Lumi Control Panel`,
    [
      "Manage everything for this server from one place — no scattered commands to remember.",
      glance,
      tabs,
    ],
    {
      footer: "Select an option below to continue.",
      actionRows: [hubRow()],
    },
  );
}

export function buildSettingsView(settings: {
  prefix: string | null;
  locale: string;
}): CardReply {
  const body = [
    `${Emojis.GUILD} **Language** — \`${settings.locale}\``,
    `${Emojis.TERMINAL} **Prefix** — \`${settings.prefix ?? DEFAULT_PREFIX}\`${
      settings.prefix ? "" : "  -# *(default)*"
    }`,
  ].join("\n");

  const langSelect = new StringSelectMenuBuilder()
    .setCustomId("lumi:setlang")
    .setPlaceholder("Change language…")
    .addOptions(
      SUPPORTED_LANGUAGES.map((lang) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(lang)
          .setValue(lang)
          .setDefault(lang === settings.locale),
      ),
    );

  const prefixButtons = row(
    new ButtonBuilder()
      .setCustomId("lumi:prefix:set")
      .setLabel("Set Prefix")
      .setEmoji(Emojis.parse(Emojis.EDIT))
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("lumi:prefix:reset")
      .setLabel("Reset to Default")
      .setEmoji(Emojis.parse(Emojis.UNINSTALL))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(settings.prefix === null),
  );

  const updateButtons = row(
    new ButtonBuilder()
      .setCustomId("lumi:update_all")
      .setLabel("Check & Fetch Updates")
      .setEmoji(Emojis.parse("🔄"))
      .setStyle(ButtonStyle.Primary),
  );

  return makeCard(0, `${Emojis.GUILD} Server Settings`, body, {
    footer:
      "Prefix commands work for a curated set of moderation and utility commands.",
    actionRows: [backToHubRow(), row(langSelect), prefixButtons, updateButtons],
  });
}

export interface PermissionOverrideRow {
  commandPath: string;
  modelType: string;
  modelId: string;
  allow: boolean;
}

const formatOverride = (o: PermissionOverrideRow): string => {
  const dot = o.allow ? Emojis.CHECK : Emojis.CROSS;
  let mention: string;
  if (o.modelType === "everyone") mention = "@everyone";
  else if (o.modelType === "role") mention = roleMention(o.modelId);
  else if (o.modelType === "user") mention = userMention(o.modelId);
  else if (o.modelType === "category")
    mention = `category ${channelMention(o.modelId)}`;
  else mention = channelMention(o.modelId);
  return `${dot} \`${o.commandPath}\` — ${o.modelType} ${mention}`;
};

const overrideLabel = (o: PermissionOverrideRow): string => {
  const target = o.modelType === "everyone" ? "everyone" : o.modelId;
  return `${o.allow ? "✓" : "✕"} ${o.commandPath} · ${o.modelType} ${target}`;
};

export function buildPermissionsView(
  overrides: PermissionOverrideRow[],
): CardReply {
  const shown = overrides.slice(0, 25);
  const lines = shown.length
    ? shown.map(formatOverride)
    : [
        "*No permission overrides set — every command uses its default access.*",
      ];

  const addRow = row(
    new ButtonBuilder()
      .setCustomId("lumi:perm:allow")
      .setLabel("Allow…")
      .setEmoji(Emojis.parse(Emojis.CHECK))
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("lumi:perm:deny")
      .setLabel("Deny…")
      .setEmoji(Emojis.parse(Emojis.CROSS))
      .setStyle(ButtonStyle.Danger),
  );

  const rows: Row[] = [backToHubRow(), addRow];
  if (shown.length) {
    rows.push(
      row(
        new StringSelectMenuBuilder()
          .setCustomId("lumi:permrm")
          .setPlaceholder("Remove an override…")
          .addOptions(
            shown.map((o) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(overrideLabel(o).slice(0, 100))
                .setValue(`${o.modelType}|${o.modelId}|${o.commandPath}`)
                .setEmoji(Emojis.parse(o.allow ? Emojis.CHECK : Emojis.CROSS)),
            ),
          ),
      ),
    );
  }

  return noPingCard(
    makeCard(
      0,
      `${Emojis.SHIELD} Command Permissions`,
      [
        lines.join("\n"),
        `-# ${Emojis.CHECK} allow · ${Emojis.CROSS} deny. Overrides take priority over a command's default access level.`,
      ],
      {
        footer:
          overrides.length > shown.length
            ? `Showing ${shown.length} of ${overrides.length} overrides.`
            : `${overrides.length} override${overrides.length === 1 ? "" : "s"}`,
        actionRows: rows,
      },
    ),
  );
}

export function buildAddonsView(): CardReply {
  const body = [
    "Add-ons are community-built modules that install and behave exactly like first-party features — once added, they appear in the **Modules** tab with full config, permissions, and enable/disable support.",
    [
      `${Emojis.REPO} **Repositories** — add, remove, or update sources`,
      `${Emojis.DOWNLOAD} **Modules** — install or uninstall modules`,
      `${Emojis.SHIELD} **Sandboxed** — add-ons follow the same permission model as core`,
    ].join("\n"),
  ];

  const repoButtons = row(
    new ButtonBuilder()
      .setCustomId("lumi:addon:add_repo")
      .setLabel("Add Repo")
      .setEmoji(Emojis.parse(Emojis.REPO))
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("lumi:addon:rm_repo")
      .setLabel("Remove Repo")
      .setEmoji(Emojis.parse(Emojis.UNINSTALL))
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("lumi:addon:update_repo")
      .setLabel("Update Repo")
      .setEmoji(Emojis.parse("🔄"))
      .setStyle(ButtonStyle.Secondary),
  );

  const moduleButtons = row(
    new ButtonBuilder()
      .setCustomId("lumi:addon:install")
      .setLabel("Install Module")
      .setEmoji(Emojis.parse(Emojis.DOWNLOAD))
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("lumi:addon:uninstall")
      .setLabel("Uninstall Module")
      .setEmoji(Emojis.parse(Emojis.CROSS))
      .setStyle(ButtonStyle.Danger),
  );

  return makeCard(0, `${Emojis.REPO} Addons`, body, {
    footer: "Add-on management requires the Bot Owner permission level.",
    actionRows: [backToHubRow(), repoButtons, moduleButtons],
  });
}
