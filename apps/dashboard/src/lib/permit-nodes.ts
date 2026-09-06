/**
 * Mirrors packages/core/src/lib/permissions/permit-nodes.ts - the set of
 * permit nodes actually referenced by `requiredPermit`/`checkPermit` across
 * commands, extended with human labels/descriptions for the dashboard picker.
 */
export const KnownPermitNodeGroups: {
  prefix: string;
  nodes: { node: string; label: string; description: string }[];
}[] = [
  {
    prefix: "admin",
    nodes: [
      {
        node: "admin.*",
        label: "Full admin access",
        description:
          "Every admin-tier command: dashboard link, bot diagnostics, permit management, panic mode, verification panel, and backup restore.",
      },
      {
        node: "admin.config",
        label: "Configure moderation settings",
        description: "Edit auto-moderation settings like warning escalation thresholds.",
      },
      {
        node: "admin.welcome",
        label: "Preview welcome cards",
        description: "Render welcome, goodbye, and DM greeting previews with /welcome.",
      },
    ],
  },
  {
    prefix: "mod",
    nodes: [
      {
        node: "mod.*",
        label: "Full moderation access",
        description:
          "Every core moderation command: ban, unban, kick, timeout, warn, quarantine, purge, and case history.",
      },
      {
        node: "mod.lockdown",
        label: "Lock down channels",
        description: "Lock a channel to stop new messages during a raid or incident.",
      },
      {
        node: "mod.notes",
        label: "Manage moderator notes",
        description: "Add and view private staff notes on a member's moderation history.",
      },
      {
        node: "mod.softBan",
        label: "Softban members",
        description: "Ban then immediately unban to purge a member's recent messages.",
      },
      {
        node: "mod.voiceMute",
        label: "Voice mute members",
        description: "Mute and unmute members in voice channels.",
      },
      {
        node: "mod.say",
        label: "Relay messages",
        description: "Send a message through the bot into any channel.",
      },
      {
        node: "mod.dm",
        label: "Relay direct messages",
        description: "Send a direct message through the bot to any user.",
      },
    ],
  },
  {
    prefix: "economy",
    nodes: [
      {
        node: "economy.*",
        label: "Full economy access",
        description: "Every economy command, including staff balance adjustments.",
      },
      {
        node: "economy.admin",
        label: "Adjust balances",
        description: "Set, add, or remove any member's wallet or bank balance with an audit reason.",
      },
    ],
  },
  {
    prefix: "reactionroles",
    nodes: [
      {
        node: "reactionroles.*",
        label: "Full reaction-roles access",
        description: "Every reaction-roles command: create, post, and manage self-serve role menus.",
      },
      {
        node: "reactionroles.manage",
        label: "Manage role menus",
        description: "Create role menus, edit their options and gates, post them, and delete them.",
      },
    ],
  },
  {
    prefix: "owner",
    nodes: [
      {
        node: "owner.*",
        label: "Full owner access",
        description: "Every owner-tier command, including AFK-cleanup tooling and AFK stats.",
      },
      {
        node: "owner.serverlock",
        label: "Manage server lock",
        description: "Lock the bot to its current servers so it leaves newly joined ones.",
      },
      {
        node: "owner.leave",
        label: "Leave servers",
        description: "Make the bot leave any server with the sv leave command.",
      },
      {
        node: "owner.announce",
        label: "Global announcements",
        description: "Broadcast one message to every server with the announce command.",
      },
    ],
  },
];

export const KnownPermitNodes: string[] = KnownPermitNodeGroups.flatMap((group) =>
  group.nodes.map((n) => n.node),
);
