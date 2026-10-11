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
