import { LumiInfo } from "#src/lib/utilities/Version.js";

export const LUMI_ART = [
  "                  .",
  "            *          *",
  "        .                  .",
  "                 ___",
  "                /   \\",
  "                |^ ^|",
  "                | ~ |",
  "                \\___/",
  "                 |_|",
  "                __|__",
  "",
  "██╗     ██╗   ██╗███╗   ███╗██╗",
  "██║     ██║   ██║████╗ ████║██║",
  "██║     ██║   ██║██╔████╔██║██║",
  "██║     ██║   ██║██║╚██╔╝██║██║",
  "███████╗╚██████╔╝██║ ╚═╝ ██║██║",
  "╚══════╝ ╚═════╝ ╚═╝     ╚═╝╚═╝",
  "      self-hosted · allergic to downtime",
].join("\n");

export interface BootStats {
  guilds: number;
  members: number;
  channels: number;
  modules: number;
}

export function printBootBanner(stats: BootStats, inviteUrl: string): void {
  const lines = [
    "",
    LUMI_ART,
    "",
    `  Lumi v${LumiInfo.version} · Bun ${Bun.version} · ${stats.modules} modules`,
    `  ${stats.guilds} servers · ${stats.members} members · ${stats.channels} channels`,
    `  Invite: ${inviteUrl}`,
    `  Source: ${LumiInfo.github}`,
    "",
  ];
  console.log(lines.join("\n"));
}
