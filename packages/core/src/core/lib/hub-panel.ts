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
import { makeCard, noPingCard, type CardReply } from "#utilities/cards.js";
import { Colors } from "#utilities/branding.js";
import { Emojis } from "#utilities/assets.js";
import { SUPPORTED_LANGUAGES } from "#core/i18n/index.js";

export const DEFAULT_PREFIX = ",";

type Row = ActionRowBuilder<MessageActionRowComponentBuilder>;

const row = (...components: MessageActionRowComponentBuilder[]): Row =>
  new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    ...components,
  );

const homeButton = (): ButtonBuilder =>
  new ButtonBuilder()
    .setCustomId("lumi:home")
    .setLabel("Control Panel")
    .setEmoji(Emojis.parse(Emojis.BOT))
    .setStyle(ButtonStyle.Secondary);

// ── Hub root ───────────────────────────────────────────────────────────────

export interface HubStats {
  moduleCount: number;
  enabledCount: number;
  showAddons: boolean;
}

/** The tab strip shown at the top of every hub view. */
const tabRow = (showAddons: boolean): Row => {
  const buttons = [
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
  ];
  if (showAddons) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId("lumi:tab:addons")
        .setLabel("Addons")
        .setEmoji(Emojis.parse(Emojis.REPO))
        .setStyle(ButtonStyle.Primary),
    );
  }
  return row(...buttons);
};

export function buildHubView(stats: HubStats): CardReply {
  const body = [
    "Everything you need to run this server lives here — no scattered commands.",
    [
      `${Emojis.GEAR} **Modules** — enable, disable, and configure features (${stats.enabledCount}/${stats.moduleCount} enabled)`,
      `${Emojis.SHIELD} **Permissions** — per-command allow / deny overrides`,
      `${Emojis.GUILD} **Settings** — language and command prefix`,
      ...(stats.showAddons
        ? [`${Emojis.REPO} **Addons** — install and manage add-on modules`]
        : []),
    ].join("\n"),
  ];

  return makeCard(Colors.PRIMARY, `${Emojis.BOT} Lumi Control Panel`, body, {
    footer: "Pick a tab below to get started.",
    actionRows: [tabRow(stats.showAddons)],
  });
}

// ── Settings tab ───────────────────────────────────────────────────────────

export function buildSettingsView(settings: {
  prefix: string | null;
  locale: string;
}): CardReply {
  const body = [
    `**Language:** \`${settings.locale}\``,
    `**Prefix:** \`${settings.prefix ?? DEFAULT_PREFIX}\`${
      settings.prefix ? "" : " -# *(default)*"
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
      .setLabel("Reset Prefix")
      .setEmoji(Emojis.parse(Emojis.UNINSTALL))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(settings.prefix === null),
    homeButton(),
  );

  return makeCard(Colors.PRIMARY, `${Emojis.GUILD} Server Settings`, body, {
    actionRows: [row(langSelect), prefixButtons],
  });
}

// ── Permissions tab ────────────────────────────────────────────────────────

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

export function buildPermissionsView(
  overrides: PermissionOverrideRow[],
): CardReply {
  const lines = overrides.length
    ? overrides.slice(0, 25).map(formatOverride)
    : ["*No permission overrides set.*"];

  const body = [
    lines.join("\n"),
    "-# Add or remove overrides with `/permissions allow`, `/permissions deny`, and `/permissions reset`.",
  ];

  return noPingCard(
    makeCard(Colors.PRIMARY, `${Emojis.SHIELD} Command Permissions`, body, {
      footer:
        overrides.length > 25
          ? `Showing 25 of ${overrides.length} overrides — use /permissions list to see all.`
          : undefined,
      actionRows: [row(homeButton())],
    }),
  );
}

// ── Addons tab ─────────────────────────────────────────────────────────────

export function buildAddonsView(): CardReply {
  const body = [
    "Add-on modules extend Lumi with community-built features that install like first-party modules — configured from the **Modules** tab once added.",
    `-# Manage add-on repositories with ${Emojis.REPO} \`/repo\`.`,
  ];

  return makeCard(Colors.PRIMARY, `${Emojis.REPO} Addons`, body, {
    footer: "Installed add-ons appear alongside core modules.",
    actionRows: [row(homeButton())],
  });
}
