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
        node: "mod.appeals",
        label: "Review member appeals",
        description: "Review and decide on ban appeals submitted through the public appeal form.",
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
    ],
  },
];

export const KnownPermitNodes: string[] = KnownPermitNodeGroups.flatMap((group) =>
  group.nodes.map((n) => n.node),
);
