export interface PermitNodeGroup {
  prefix: string;
  nodes: PermitNode[];
}

export type PermitNode =
  | "admin.*"
  | "admin.config"
  | "admin.welcome"
  | "mod.*"
  | "mod.lockdown"
  | "mod.notes"
  | "mod.softBan"
  | "mod.voiceMute"
  | "mod.say"
  | "mod.dm"
  | "economy.*"
  | "economy.admin"
  | "reactionroles.*"
  | "reactionroles.manage"
  | "owner.*"
  | "owner.serverlock"
  | "owner.leave"
  | "owner.announce"
  | "logging.claim";

export const KnownPermitNodeGroups: PermitNodeGroup[] = [
  { prefix: "admin", nodes: ["admin.*", "admin.config", "admin.welcome"] },
  {
    prefix: "mod",
    nodes: [
      "mod.*",
      "mod.lockdown",
      "mod.notes",
      "mod.softBan",
      "mod.voiceMute",
      "mod.say",
      "mod.dm",
    ],
  },
  { prefix: "economy", nodes: ["economy.*", "economy.admin"] },
  {
    prefix: "reactionroles",
    nodes: ["reactionroles.*", "reactionroles.manage"],
  },
  {
    prefix: "owner",
    nodes: ["owner.*", "owner.serverlock", "owner.leave", "owner.announce"],
  },
  { prefix: "logging", nodes: ["logging.claim"] },
];

export const KnownPermitNodes: PermitNode[] = KnownPermitNodeGroups.flatMap(
  (group) => group.nodes,
);
