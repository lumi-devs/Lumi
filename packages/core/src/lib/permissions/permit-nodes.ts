/**
 * The core set of permit nodes actually referenced by `requiredPermit`/`checkPermit`
 * across commands. This list is mirrored and extended with UI-only metadata by
 * `apps/dashboard/src/lib/permit-nodes.ts`.
 */
export const KnownPermitNodeGroups: { prefix: string; nodes: string[] }[] = [
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
  {
    prefix: "economy",
    nodes: ["economy.*", "economy.admin"],
  },
  {
    prefix: "reactionroles",
    nodes: ["reactionroles.*", "reactionroles.manage"],
  },
  { prefix: "owner", nodes: ["owner.*", "owner.serverlock", "owner.leave", "owner.announce"] },
];

const PermitNodeEmoji: Record<string, string> = {
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

export const KnownPermitNodesAutocomplete: string[] =
  KnownPermitNodeGroups.flatMap((group) => group.nodes);

export function permitNodeLabel(node: string): string {
  return `${PermitNodeEmoji[node] || "•"} ${node}`;
}
