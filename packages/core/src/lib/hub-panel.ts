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
import { Colors } from "#lib/utilities/branding.js";
import { Emojis } from "#lib/utilities/assets.js";
import { SUPPORTED_LANGUAGES } from "#lib/i18n/index.js";

export const DEFAULT_PREFIX = ",";

type Row = ActionRowBuilder<MessageActionRowComponentBuilder>;

const row = (...components: MessageActionRowComponentBuilder[]): Row =>
  new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    ...components,
  );

export type HubTab =
  | "overview"
  | "modules"
  | "permissions"
  | "settings"
  | "addons";

interface TabDef {
  tab: HubTab;
  customId: string;
  label: string;
  emoji: string;
}

const TABS: readonly TabDef[] = [
  {
    tab: "overview",
    customId: "lumi:home",
    label: "Overview",
    emoji: Emojis.BOT,
  },
  {
    tab: "modules",
    customId: "lumi:tab:modules",
    label: "Modules",
    emoji: Emojis.GEAR,
  },
  {
    tab: "permissions",
    customId: "lumi:tab:permissions",
    label: "Permissions",
    emoji: Emojis.SHIELD,
  },
  {
    tab: "settings",
    customId: "lumi:tab:settings",
    label: "Settings",
    emoji: Emojis.GUILD,
  },
  {
    tab: "addons",
    customId: "lumi:tab:addons",
    label: "Addons",
    emoji: Emojis.REPO,
  },
];

/**
 * The persistent hub navigation bar. Rendered at the top of every top-level
 * view; the active tab is highlighted (Primary) and the rest are muted.
 */
export function tabRow(active: HubTab): Row {
  return row(
    ...TABS.map((t) =>
      new ButtonBuilder()
        .setCustomId(t.customId)
        .setLabel(t.label)
        .setEmoji(Emojis.parse(t.emoji))
        .setStyle(
          t.tab === active ? ButtonStyle.Primary : ButtonStyle.Secondary,
        ),
    ),
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
    Colors.PRIMARY,
    `${Emojis.BOT} Lumi Control Panel`,
    [
      "Manage everything for this server from one place — no scattered commands to remember.",
      glance,
      tabs,
    ],
    {
      footer: "Select a tab below to continue.",
      actionRows: [tabRow("overview")],
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

  return makeCard(Colors.PRIMARY, `${Emojis.GUILD} Server Settings`, body, {
    footer:
      "Prefix commands work for a curated set of moderation and utility commands.",
    actionRows: [tabRow("settings"), row(langSelect), prefixButtons],
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

  const rows: Row[] = [tabRow("permissions"), addRow];
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
      Colors.PRIMARY,
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
      `${Emojis.REPO} **Repositories** — add or remove sources with \`/repo\``,
      `${Emojis.DOWNLOAD} **Install** — pull a module from a configured repository`,
      `${Emojis.SHIELD} **Sandboxed** — add-ons follow the same permission model as core`,
    ].join("\n"),
  ];

  return makeCard(Colors.PRIMARY, `${Emojis.REPO} Addons`, body, {
    footer: "Add-on management requires the Bot Owner permission level.",
    actionRows: [tabRow("addons")],
  });
}
