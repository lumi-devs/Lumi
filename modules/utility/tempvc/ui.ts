import {
  type CardReply,
  createActionButton,
  createStringSelectMenu,
  createUserSelectMenu,
  formatStatusBadge,
  makeCard,
  makeWarningCard,
  row,
} from "@lumi/ui";
import { ButtonStyle } from "discord.js";
import { type MemberAction, TempVcIds } from "./ids.js";

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

export const limitLabel = (limit: number): string =>
  limit === 0 ? "Unlimited" : String(limit);

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

  return makeCard(undefined, `🔊 ${state.channelName}`, body, {
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

  return makeCard(undefined, `${meta.emoji} ${meta.title}`, body, {
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
