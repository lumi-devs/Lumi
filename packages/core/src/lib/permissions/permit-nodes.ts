/**
 * The core set of permit nodes actually referenced by `requiredPermit`/`checkPermit`
 * across commands. This list is mirrored and extended with UI-only metadata by
 * `apps/dashboard/src/lib/permit-nodes.ts`.
 */
export const KnownPermitNodeGroups: { prefix: string; nodes: string[] }[] = [
  { prefix: "admin", nodes: ["admin.*", "admin.config"] },
  {
    prefix: "mod",
    nodes: [
      "mod.*",
      "mod.appeals",
      "mod.lockdown",
      "mod.notes",
      "mod.softBan",
      "mod.voiceMute",
    ],
  },
  { prefix: "owner", nodes: ["owner.*"] },
];

const PermitNodeEmoji: Record<string, string> = {
  "admin.*": "🔐",
  "admin.config": "⚙️",
  "mod.*": "🛡️",
  "mod.appeals": "📜",
  "mod.lockdown": "🔒",
  "mod.notes": "📝",
  "mod.softBan": "⏳",
  "mod.voiceMute": "🔇",
  "owner.*": "👑",
};

export const KnownPermitNodesAutocomplete: string[] =
  KnownPermitNodeGroups.flatMap((group) => group.nodes);

export function permitNodeLabel(node: string): string {
  return `${PermitNodeEmoji[node] || "•"} ${node}`;
}
