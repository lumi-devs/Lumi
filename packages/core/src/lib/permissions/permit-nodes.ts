/**
 * Bot-side view of the canonical permit vocabulary (`@lumi/contracts`).
 * Node membership lives in contracts; this module only adds chat affordances
 * (emoji labels, autocomplete list) so the dashboard picker can't drift.
 */
export {
  KnownPermitNodeGroups,
  KnownPermitNodes,
  type PermitNode,
  type PermitNodeGroup,
} from "@lumi/contracts";
import type { PermitNode } from "@lumi/contracts";

const PermitNodeEmoji: Record<PermitNode, string> = {
  "economy.*": "🪙",
  "economy.admin": "💰",
  "reactionroles.*": "🎭",
  "reactionroles.manage": "🎟️",
  "admin.*": "🔐",
  "admin.config": "⚙️",
  "admin.welcome": "👋",
  "mod.*": "🛡️",
  "mod.lockdown": "🔒",
  "mod.notes": "📝",
  "mod.softBan": "⏳",
  "mod.voiceMute": "🔇",
  "mod.say": "📢",
  "mod.dm": "📨",
  "owner.*": "👑",
  "owner.serverlock": "🔒",
  "owner.leave": "👋",
  "owner.announce": "🔔",
};

export { KnownPermitNodes as KnownPermitNodesAutocomplete } from "@lumi/contracts";

export function permitNodeLabel(node: string): string {
  return `${PermitNodeEmoji[node as PermitNode] ?? "•"} ${node}`;
}
