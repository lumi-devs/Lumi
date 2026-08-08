/**
 * Mirrors apps/dashboard/src/lib/permit-nodes.ts - the set of permit nodes
 * actually referenced by `requiredPermit`/`checkPermit` across commands.
 */
export const KNOWN_PERMIT_NODE_GROUPS: { prefix: string; nodes: string[] }[] = [
  { prefix: "admin", nodes: ["admin.*", "admin.config"] },
  {
    prefix: "mod",
    nodes: [
      "mod.*",
      "mod.appeals",
      "mod.lockdown",
      "mod.notes",
      "mod.softban",
      "mod.voicemute",
    ],
  },
  { prefix: "owner", nodes: ["owner.*"] },
];

export const KNOWN_PERMIT_NODES: string[] = KNOWN_PERMIT_NODE_GROUPS.flatMap(
  (group) => group.nodes,
);
