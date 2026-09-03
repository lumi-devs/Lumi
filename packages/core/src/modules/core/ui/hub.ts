import { SUPPORTED_LANGUAGES, type LumiT } from "#lib/i18n/index.js";
import { PanelsKeys } from "#lib/i18n/keys.js";
import { row, type Row } from "#modules/core/ui/common.js";
import { Emojis } from "#utilities/assets.js";
import { resolveCardColor, makeCard, type CardReply } from "#utilities/cards.js";
import {
  createStringSelectMenu,
  settingRow,
  tabRow,
  type Tab,
} from "#utilities/panels.js";
import {
  ButtonBuilder,
  SectionBuilder,
  StringSelectMenuOptionBuilder,
} from "@discordjs/builders";
import { ButtonStyle } from "discord.js";

export const DEFAULT_PREFIX = ",";

export type HubTabId =
  "home" | "modules" | "permissions" | "settings" | "addons";

const hubTabs = (t?: LumiT): Tab[] => [
  { id: "home", label: t ? t(PanelsKeys.TabHome) : "Hub", emoji: Emojis.BOT },
  {
    id: "modules",
    label: t ? t(PanelsKeys.TabModules) : "Modules",
    emoji: Emojis.GEAR,
  },
  {
    id: "permissions",
    label: t ? t(PanelsKeys.TabPermissions) : "Permissions",
    emoji: Emojis.SHIELD,
  },
  {
    id: "settings",
    label: t ? t(PanelsKeys.TabSettings) : "Settings",
    emoji: Emojis.GUILD,
  },
  {
    id: "addons",
    label: t ? t(PanelsKeys.TabAddons) : "Addons",
    emoji: Emojis.REPO,
  },
];

/**
 * The persistent tab bar shown on every hub view. The row is owned by the
 * caller, which appends it as the last action row of its card.
 *
 * @param active - The tab to render as the current one; it renders disabled.
 */
export function hubTabRow(active: HubTabId, t?: LumiT): Row {
  return tabRow("lumi:tab", hubTabs(t), active);
}

export function backToHubRow(t?: LumiT): Row {
  return row(
    new ButtonBuilder()
      .setCustomId("lumi:tab:home")
      .setLabel(t ? t(PanelsKeys.BackToHub) : "Back to Hub")
      .setEmoji(Emojis.parse(Emojis.ARROW_LEFT))
      .setStyle(ButtonStyle.Secondary),
  );
}

export interface HubOverview {
  moduleCount: number;
  enabledCount: number;
  prefix: string | null;
  locale: string;
  iconUrl?: string | null;
}

/** The hub landing card: a counts summary plus the per-tab hint list. */
export function buildHubView(o: HubOverview, t?: LumiT): CardReply {
  const prefix = o.prefix ?? DEFAULT_PREFIX;
  const glanceLines = [
    t
      ? t(PanelsKeys.HubIntro)
      : "Manage everything for this server from one place - no scattered commands to remember.",
    `${Emojis.GEAR} ${
      t
        ? t(PanelsKeys.HubGlanceModules, {
            enabled: o.enabledCount,
            total: o.moduleCount,
          })
        : `**${o.enabledCount}** of **${o.moduleCount}** modules enabled`
    }`,
    `${Emojis.GUILD} ${
      t
        ? t(PanelsKeys.HubGlanceLocale, { locale: o.locale, prefix })
        : `Language \`${o.locale}\`  •  Prefix \`${prefix}\``
    }`,
  ];

  const hints = [
    `${Emojis.GEAR} **${t ? t(PanelsKeys.TabModules) : "Modules"}** - ${t ? t(PanelsKeys.TabHintModules) : "enable, disable, and configure every feature"}`,
    `${Emojis.SHIELD} **${t ? t(PanelsKeys.TabPermissions) : "Permissions"}** - ${t ? t(PanelsKeys.TabHintPermissions) : "permit grants and per-command overrides"}`,
    `${Emojis.GUILD} **${t ? t(PanelsKeys.TabSettings) : "Settings"}** - ${t ? t(PanelsKeys.TabHintSettings) : "server language and command prefix"}`,
    `${Emojis.REPO} **${t ? t(PanelsKeys.TabAddons) : "Addons"}** - ${t ? t(PanelsKeys.TabHintAddons) : "extend Lumi with add-on modules"}`,
  ].join("\n");

  return makeCard(
    resolveCardColor("primary"),
    `${Emojis.BOT} ${t ? t(PanelsKeys.HubTitle) : "Lumi Control Panel"}`,
    [glanceLines.join("\n"), hints],
    {
      breadcrumbs: ["Hub"],
      footer: t ? t(PanelsKeys.HubFooter) : "Select a tab below to continue.",
      thumbnailUrl: o.iconUrl ?? undefined,
      actionRows: [hubTabRow("home", t)],
      separatorAboveActionRows: true,
    },
  );
}

/** The settings tab: prefix editing, language picker, and core maintenance. */
export function buildSettingsView(
  settings: { prefix: string | null; locale: string },
  t?: LumiT,
): CardReply {
  const prefixLabel = t ? t(PanelsKeys.SettingsPrefix) : "Prefix";
  const prefixValue = `\`${settings.prefix ?? DEFAULT_PREFIX}\`${
    settings.prefix
      ? ""
      : ` *${t ? t(PanelsKeys.SettingsPrefixDefault) : "(default)"}*`
  }`;

  const sections: SectionBuilder[] = [
    settingRow(
      [
        `${Emojis.TERMINAL} **${prefixLabel}** - ${prefixValue}`,
        `-# ${t ? t(PanelsKeys.SettingsFooter) : "Prefix commands work for a curated set of moderation and utility commands."}`,
      ],
      {
        customId: "lumi:prefix:set",
        label: t ? t(PanelsKeys.SettingsEdit) : "Edit",
        emoji: Emojis.EDIT,
      },
    ),
  ];

  const langSelect = createStringSelectMenu({
    customId: "lumi:setlang",
    placeholder: t ? t(PanelsKeys.SettingsChangeLanguage) : "Change language…",
    options: SUPPORTED_LANGUAGES.slice(0, 25).map((lang) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(lang)
        .setValue(lang)
        .setDefault(lang === settings.locale),
    ),
  });

  const maintenanceButtons = row(
    new ButtonBuilder()
      .setCustomId("lumi:prefix:reset")
      .setLabel(t ? t(PanelsKeys.SettingsReset) : "Reset")
      .setEmoji(Emojis.parse(Emojis.UNINSTALL))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(settings.prefix === null),
    new ButtonBuilder()
      .setCustomId("lumi:update_all")
      .setLabel(t ? t(PanelsKeys.SettingsUpdateAddons) : "Update Addons")
      .setEmoji(Emojis.parse("🔄"))
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("lumi:check_core")
      .setLabel(t ? t(PanelsKeys.SettingsCheckCore) : "Check Core")
      .setEmoji(Emojis.parse(Emojis.BOT))
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("lumi:update_core")
      .setLabel(t ? t(PanelsKeys.SettingsUpdateCore) : "Update Lumi Core")
      .setEmoji(Emojis.parse(Emojis.BOT))
      .setStyle(ButtonStyle.Primary),
  );

  return makeCard(
    resolveCardColor("primary"),
    `${Emojis.GUILD} ${t ? t(PanelsKeys.SettingsTitle) : "Server Settings"}`,
    `${Emojis.GUILD} **${t ? t(PanelsKeys.SettingsLanguage) : "Language"}** - \`${settings.locale}\``,
    {
      breadcrumbs: ["Hub", "Settings"],
      sections,
      actionRows: [
        row(langSelect),
        maintenanceButtons,
        hubTabRow("settings", t),
      ],
      separatorAboveActionRows: true,
    },
  );
}
