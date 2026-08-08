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
