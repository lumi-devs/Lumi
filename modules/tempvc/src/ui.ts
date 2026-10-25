import { ButtonStyle, ChannelType, type Guild } from "discord.js";
import {
  BrandColors,
  createActionButton,
  createChannelSelectMenu,
  createStringSelectMenu,
  createUserSelectMenu,
  formatStatusBadge,
  makeCard,
  makeWarningCard,
  row,
  type CardReply,
} from "@lumi/ui";
import type { TempVcConfig, TempVcGenerator } from "./panel.js";

export type MemberAction =
  | "kick"
  | "trust"
  | "untrust"
  | "block"
  | "unblock"
  | "transfer";

export interface ControlPanelState {
  channelId: string;
  channelName: string;
  ownerId: string;
  userLimit: number;
  memberCount: number;
  locked: boolean;
  hidden: boolean;
  ownerPresent: boolean;
}

const clip = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

const code = (text: string): string => `\`${text.replace(/`/g, "'")}\``;

const limitLabel = (limit: number): string =>
  limit === 0 ? "Unlimited" : String(limit);

export const TempVcIds = {
  panel: (channelId: string) => `tempvc:panel:${channelId}`,
  refresh: (channelId: string) => `tempvc:refresh:${channelId}`,
  claim: (channelId: string) => `tempvc:claim:${channelId}`,
  delete: (channelId: string) => `tempvc:delete:${channelId}`,
  modalRename: (channelId: string) => `tempvc:modal:rename:${channelId}`,
  modalLimit: (channelId: string) => `tempvc:modal:limit:${channelId}`,
  pick: (action: MemberAction, channelId: string) =>
    `tempvc:pick:${action}:${channelId}`,
  adminAdd: "tempvc:admin:add",
  adminPick: "tempvc:admin:pick",
  adminBack: "tempvc:admin:back",
  adminConfig: "tempvc:admin:config",
  adminRename: (generatorId: string) => `tempvc:admin:rename:${generatorId}`,
  adminLimit: (generatorId: string) => `tempvc:admin:limit:${generatorId}`,
  adminRemove: (generatorId: string) => `tempvc:admin:remove:${generatorId}`,
  adminRemoveConfirm: (generatorId: string) =>
    `tempvc:admin:removeconfirm:${generatorId}`,
  adminRemoveCancel: (generatorId: string) =>
    `tempvc:admin:removecancel:${generatorId}`,
  adminModalRename: (generatorId: string) =>
    `tempvc:admin:modal:rename:${generatorId}`,
  adminModalLimit: (generatorId: string) =>
    `tempvc:admin:modal:limit:${generatorId}`,
  cfgCategory: "tempvc:cfg:category",
  cfgEdit: "tempvc:cfg:edit",
  cfgModal: (key: string) => `tempvc:cfg:modal:${key}`,
} as const;

export const TempVcPrefixes = {
  panel: "tempvc:panel:",
  refresh: "tempvc:refresh:",
  claim: "tempvc:claim:",
  delete: "tempvc:delete:",
  modalRename: "tempvc:modal:rename:",
  modalLimit: "tempvc:modal:limit:",
  pick: "tempvc:pick:",
  admin: "tempvc:admin:",
  cfg: "tempvc:cfg:",
  adminRename: "tempvc:admin:rename:",
  adminLimit: "tempvc:admin:limit:",
  adminRemove: "tempvc:admin:remove:",
  adminRemoveConfirm: "tempvc:admin:removeconfirm:",
  adminRemoveCancel: "tempvc:admin:removecancel:",
  adminModalRename: "tempvc:admin:modal:rename:",
  adminModalLimit: "tempvc:admin:modal:limit:",
  cfgModal: "tempvc:cfg:modal:",
} as const;

const memberActionMeta: Record<
  MemberAction,
  {
    emoji: string;
    title: string;
    placeholder: string;
    body: string;
    footer: string;
  }
> = {
  kick: {
    emoji: "👢",
    title: "Kick Member",
    placeholder: "Choose a connected member...",
    body: "The selected member will be disconnected from this channel.",
    footer: "Only members currently connected can be kicked",
  },
  trust: {
    emoji: "✅",
    title: "Trust Member",
    placeholder: "Choose a member to trust...",
    body: "Trusted members can join, speak, and stream even while the channel is locked.",
    footer: "Trust grants view, connect, speak, and stream access",
  },
  untrust: {
    emoji: "❌",
    title: "Untrust Member",
    placeholder: "Choose a member to untrust...",
    body: "The selected member loses their explicit channel access.",
    footer: "Their access returns to the server defaults",
  },
  block: {
    emoji: "⛔",
    title: "Block Member",
    placeholder: "Choose a member to block...",
    body: "The selected member is denied access and removed from the channel.",
    footer: "Blocked members cannot see or join this channel",
  },
  unblock: {
    emoji: "♻️",
    title: "Unblock Member",
    placeholder: "Choose a member to unblock...",
    body: "The selected member regains the channel's default access.",
    footer: "Their explicit block is removed",
  },
  transfer: {
    emoji: "👑",
    title: "Transfer Ownership",
    placeholder: "Choose the new owner...",
    body: "The selected member becomes the owner and receives channel management.",
    footer: "Only members currently connected can receive ownership",
  },
};

export function controlPanelCard(
  state: ControlPanelState,
  notice?: string,
): CardReply {
  const badges = [
    formatStatusBadge(
      state.locked ? "warning" : "success",
      state.locked ? "LOCKED" : "UNLOCKED",
    ),
    formatStatusBadge(
      state.hidden ? "disabled" : "active",
      state.hidden ? "HIDDEN" : "VISIBLE",
    ),
  ].join(" ");

  const body = [
    badges,
    `**Channel** <#${state.channelId}>`,
    `**Owner** <@${state.ownerId}>`,
    `**User Limit** ${limitLabel(state.userLimit)}`,
    `**Connected** ${state.memberCount}`,
  ];
  if (notice) body.unshift(notice);

  return makeCard(BrandColors.primary, `🔊 ${state.channelName}`, body, {
    subtitle: "Temporary voice control",
    footer: "Channel owners and members with Manage Channels can use these controls",
    separatorAboveActionRows: true,
    actionRows: [
      row(
        createStringSelectMenu({
          customId: TempVcIds.panel(state.channelId),
          placeholder: "Choose an action...",
          options: [
            {
              label: "Rename Channel",
              value: "rename",
              emoji: "✏️",
              description: "Change the channel name",
            },
            {
              label: "Set User Limit",
              value: "limit",
              emoji: "🔢",
              description: "Change how many members can connect",
            },
            {
              label: "Lock Channel",
              value: "lock",
              emoji: "🔒",
              description: "Prevent new members from connecting",
            },
            {
              label: "Unlock Channel",
              value: "unlock",
              emoji: "🔓",
              description: "Allow members to connect again",
            },
            {
              label: "Hide Channel",
              value: "hide",
              emoji: "🙈",
              description: "Hide the channel from the server",
            },
            {
              label: "Unhide Channel",
              value: "unhide",
              emoji: "👁️",
              description: "Make the channel visible again",
            },
            {
              label: "Kick Members",
              value: "kick",
              emoji: "👢",
              description: "Disconnect a member from the channel",
            },
            {
              label: "Trust Member",
              value: "trust",
              emoji: "✅",
              description: "Grant a member access while locked",
            },
            {
              label: "Untrust Member",
              value: "untrust",
              emoji: "❌",
              description: "Remove a member's explicit access",
            },
            {
              label: "Block Member",
              value: "block",
              emoji: "⛔",
              description: "Deny a member access to the channel",
            },
            {
              label: "Unblock Member",
              value: "unblock",
              emoji: "♻️",
              description: "Remove a member's block",
            },
            {
              label: "Transfer Ownership",
              value: "transfer",
              emoji: "👑",
              description: "Give the channel to another member",
            },
            {
              label: "Delete Channel",
              value: "delete",
              emoji: "🗑️",
              description: "Permanently delete this channel",
            },
          ],
        }),
      ),
      row(
        createActionButton({
          customId: TempVcIds.claim(state.channelId),
          label: "Claim Ownership",
          emoji: "👑",
          style: ButtonStyle.Secondary,
          disabled: state.ownerPresent,
        }),
      ),
    ],
  });
}

export function memberActionCard(
  action: MemberAction,
  state: ControlPanelState,
  notice?: string,
): CardReply {
  const meta = memberActionMeta[action];
  const body = [
    notice ?? `**${meta.title}**`,
    meta.body,
    `Channel: <#${state.channelId}>`,
  ].filter(Boolean);

  return makeCard(BrandColors.primary, `${meta.emoji} ${meta.title}`, body, {
    breadcrumbs: ["Temp VC", state.channelName, meta.title],
    footer: meta.footer,
    separatorAboveActionRows: true,
    actionRows: [
      row(
        createUserSelectMenu({
          customId: TempVcIds.pick(action, state.channelId),
          placeholder: meta.placeholder,
          minValues: 1,
          maxValues: 1,
        }),
      ),
      row(
        createActionButton({
          customId: TempVcIds.refresh(state.channelId),
          label: "← Back",
          style: ButtonStyle.Secondary,
        }),
      ),
    ],
  });
}

export function deleteConfirmCard(state: ControlPanelState): CardReply {
  return makeWarningCard(
    "Delete Channel",
    [
      `Delete **${state.channelName}** and disconnect everyone inside?`,
      "This cannot be undone.",
    ],
    {
      breadcrumbs: ["Temp VC", state.channelName, "Delete"],
      footer: "Only the owner or a member with Manage Channels can delete",
      separatorAboveActionRows: true,
      actionRows: [
        row(
          createActionButton({
            customId: TempVcIds.delete(state.channelId),
            label: "Delete Channel",
            emoji: "🗑️",
            style: ButtonStyle.Danger,
          }),
          createActionButton({
            customId: TempVcIds.refresh(state.channelId),
            label: "Cancel",
            style: ButtonStyle.Secondary,
          }),
        ),
      ],
    },
  );
}

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
  guild: Guild | null,
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

  return makeCard(
    BrandColors.primary,
    "🔊 Temp VC Generators",
    body,
    {
      subtitle: "Join-to-create voice channel management",
      breadcrumbs: ["Temp VC", "Admin"],
      footer: "Members joining a generator receive their own temporary channel",
      separatorAboveActionRows: true,
      actionRows,
    },
  );
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

  return makeCard(BrandColors.primary, `🔊 ${clip(name, 80)}`, body, {
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

  return makeCard(BrandColors.primary, "⚙️ Temp VC Settings", body, {
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
