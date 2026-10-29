import { ButtonStyle, ChannelType, type Guild } from "discord.js";
import {
  createActionButton,
  createChannelSelectMenu,
  createStringSelectMenu,
  makeCard,
  makeWarningCard,
  row,
  type CardReply,
} from "@lumi/ui";
import type { TempVcConfig, TempVcGenerator } from "./panel.js";
import { TempVcIds } from "./ids.js";

const clip = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

const code = (text: string): string => `\`${text.replace(/`/g, "'")}\``;

const limitLabel = (limit: number): string =>
  limit === 0 ? "Unlimited" : String(limit);

function generatorName(
  guild: Guild | null,
  generator: TempVcGenerator,
): string {
  return (
    guild?.channels.cache.get(generator.channelId)?.name ??
    generator.channelId
  );
}

function generatorLines(
  _guild: Guild | null,
  generators: TempVcGenerator[],
  config: TempVcConfig,
): string[] {
  return generators.slice(0, 20).map((generator) => {
    const template = generator.templateName ?? config.templateName;
    const limit = generator.userLimit ?? config.defaultUserLimit;
    return `• <#${generator.channelId}> · ${code(template)} · Limit ${limitLabel(limit)}`;
  });
}

export function adminPanelCard(
  guild: Guild | null,
  config: TempVcConfig,
  notice?: string,
): CardReply {
  const generators = config.generators;
  const body: string[] = [];
  if (notice) body.push(notice);
  body.push(
    generators.length === 0
      ? "No generator channels are configured yet."
      : `**${generators.length}** generator${generators.length === 1 ? "" : "s"} configured.`,
  );
  if (generators.length > 0) {
    body.push(...generatorLines(guild, generators, config));
    if (generators.length > 20) {
      body.push(`-# ...and ${generators.length - 20} more generator(s).`);
    }
  }
  body.push(
    `**Category** ${config.categoryId ? `<#${config.categoryId}>` : "Not set"}`,
    `**Default Template** ${code(config.templateName)}`,
    `**Default Limit** ${limitLabel(config.defaultUserLimit)}`,
  );

  const actionRows = [
    row(
      createChannelSelectMenu({
        customId: TempVcIds.adminAdd,
        placeholder: "Add a generator voice channel...",
        channelTypes: [ChannelType.GuildVoice],
        minValues: 1,
        maxValues: 1,
      }),
    ),
  ];

  if (generators.length > 0) {
    actionRows.push(
      row(
        createStringSelectMenu({
          customId: TempVcIds.adminPick,
          placeholder: "Manage a generator...",
          options: generators.slice(0, 25).map((generator) => ({
            label: clip(generatorName(guild, generator), 100),
            value: generator.channelId,
            description: clip(
              `Template ${generator.templateName ?? config.templateName} · Limit ${limitLabel(generator.userLimit ?? config.defaultUserLimit)}`,
              100,
            ),
          })),
        }),
      ),
    );
  }

  actionRows.push(
    row(
      createActionButton({
        customId: TempVcIds.adminConfig,
        label: "Module Settings",
        emoji: "⚙️",
        style: ButtonStyle.Secondary,
      }),
    ),
  );

  return makeCard(undefined, "🔊 Temp VC Generators", body, {
    subtitle: "Join-to-create voice channel management",
    breadcrumbs: ["Temp VC", "Admin"],
    footer: "Members joining a generator receive their own temporary channel",
    separatorAboveActionRows: true,
    actionRows,
  });
}

export function generatorManageCard(
  guild: Guild | null,
  generator: TempVcGenerator,
  config: TempVcConfig,
  notice?: string,
): CardReply {
  const name = generatorName(guild, generator);
  const template = generator.templateName ?? config.templateName;
  const limit = generator.userLimit ?? config.defaultUserLimit;
  const body = [
    notice ?? `**Generator** <#${generator.channelId}>`,
    `**Channel Name** ${clip(name, 100)}`,
    `**Name Template** ${code(template)}`,
    `**User Limit** ${limitLabel(limit)}`,
    `**Category** ${config.categoryId ? `<#${config.categoryId}>` : "Not set"}`,
  ].filter(Boolean);

  return makeCard(undefined, `🔊 ${clip(name, 80)}`, body, {
    subtitle: "Generator settings",
    breadcrumbs: ["Temp VC", "Admin", clip(name, 60)],
    footer: "Settings apply to channels created from this generator",
    separatorAboveActionRows: true,
    actionRows: [
      row(
        createActionButton({
          customId: TempVcIds.adminRename(generator.channelId),
          label: "Rename",
          emoji: "✏️",
          style: ButtonStyle.Secondary,
        }),
        createActionButton({
          customId: TempVcIds.adminLimit(generator.channelId),
          label: "Set Limit",
          emoji: "🔢",
          style: ButtonStyle.Secondary,
        }),
        createActionButton({
          customId: TempVcIds.adminRemove(generator.channelId),
          label: "Remove",
          emoji: "🗑️",
          style: ButtonStyle.Danger,
        }),
        createActionButton({
          customId: TempVcIds.adminBack,
          label: "← Back",
          style: ButtonStyle.Secondary,
        }),
      ),
    ],
  });
}

export function generatorRemoveCard(
  guild: Guild | null,
  generator: TempVcGenerator,
): CardReply {
  const name = generatorName(guild, generator);
  return makeWarningCard(
    "Remove Generator",
    [
      `Stop using **${clip(name, 80)}** as a generator?`,
      "The voice channel itself is not deleted. Existing temporary channels are unaffected.",
    ],
    {
      breadcrumbs: ["Temp VC", "Admin", clip(name, 60), "Remove"],
      separatorAboveActionRows: true,
      actionRows: [
        row(
          createActionButton({
            customId: TempVcIds.adminRemoveConfirm(generator.channelId),
            label: "Remove Generator",
            emoji: "🗑️",
            style: ButtonStyle.Danger,
          }),
          createActionButton({
            customId: TempVcIds.adminRemoveCancel(generator.channelId),
            label: "Cancel",
            style: ButtonStyle.Secondary,
          }),
        ),
      ],
    },
  );
}

const configEditOptions = [
  {
    label: "Name Template",
    value: "templateName",
    emoji: "✏️",
    description: "Use {user} for the member's display name",
  },
  {
    label: "Default User Limit",
    value: "defaultUserLimit",
    emoji: "🔢",
    description: "0 means unlimited",
  },
  {
    label: "Default Bitrate",
    value: "defaultBitrate",
    emoji: "🎚️",
    description: "8000 to 384000 bps",
  },
  {
    label: "Max Channels",
    value: "maxChannels",
    emoji: "📚",
    description: "Guild-wide temporary channel cap",
  },
  {
    label: "Max Per User",
    value: "maxPerUser",
    emoji: "👤",
    description: "Channels one member may own",
  },
  {
    label: "Empty Timeout",
    value: "emptyTimeoutMs",
    emoji: "⏱️",
    description: "Milliseconds before an empty channel is deleted",
  },
  {
    label: "Delete On Owner Leave",
    value: "ownerLeaveDelete",
    emoji: "🚪",
    description: "Delete the channel when its owner disconnects",
  },
];

export function configPanelCard(
  config: TempVcConfig,
  notice?: string,
): CardReply {
  const body = [
    notice ?? "Configure defaults for temporary voice channels.",
    `**Category** ${config.categoryId ? `<#${config.categoryId}>` : "Not set"}`,
    `**Name Template** ${code(config.templateName)}`,
    `**Default Bitrate** ${config.defaultBitrate} bps`,
    `**Default User Limit** ${limitLabel(config.defaultUserLimit)}`,
    `**Max Channels** ${config.maxChannels}`,
    `**Max Per User** ${config.maxPerUser}`,
    `**Empty Timeout** ${Math.round(config.emptyTimeoutMs / 1000)}s`,
    `**Delete On Owner Leave** ${config.ownerLeaveDelete ? "Enabled" : "Disabled"}`,
  ].filter(Boolean);

  return makeCard(undefined, "⚙️ Temp VC Settings", body, {
    subtitle: "Module defaults",
    breadcrumbs: ["Temp VC", "Admin", "Settings"],
    footer: "Per-generator templates and limits override these defaults",
    separatorAboveActionRows: true,
    actionRows: [
      row(
        createChannelSelectMenu({
          customId: TempVcIds.cfgCategory,
          placeholder: "Set the channel category...",
          channelTypes: [ChannelType.GuildCategory],
          minValues: 1,
          maxValues: 1,
        }),
      ),
      row(
        createStringSelectMenu({
          customId: TempVcIds.cfgEdit,
          placeholder: "Edit a setting...",
          options: configEditOptions,
        }),
      ),
      row(
        createActionButton({
          customId: TempVcIds.adminBack,
          label: "← Back",
          style: ButtonStyle.Secondary,
        }),
      ),
    ],
  });
}
