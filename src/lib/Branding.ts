import { LumiInfo } from "#src/lib/utilities/Version.js";

export const LUMI_ART = [
  "      ___       ___           ___",
  "     /\\__\\     /\\__\\         /\\__\\          ___",
  "    /:/  /    /:/  /        /::|  |        /\\  \\",
  "   /:/  /    /:/  /        /:|:|  |        \\:\\  \\",
  "  /:/  /    /:/  /  ___   /:/|:|__|__      /::\\__\\",
  " /:/__/    /:/__/  /\\__\\ /:/ |::::\\__\\  __/:/\\/__/",
  " \\:\\  \\    \\:\\  \\ /:/  / \\/__/~~/:/  / /\\/:/  /",
  "  \\:\\  \\    \\:\\  /:/  /        /:/  /  \\::/__/",
  "   \\:\\  \\    \\:\\/:/  /        /:/  /    \\:\\__\\",
  "    \\:\\__\\    \\::/  /        /:/  /      \\/__/",
  "     \\/__/     \\/__/         \\/__/",
  "      self-hosted · allergic to downtime",
].join("\n");

export interface BootStats {
  guilds: number;
  members: number;
  channels: number;
  modules: number;
}

export function printBootBanner(stats: BootStats, inviteUrl: string | null): void {
  const lines = [
    "",
    LUMI_ART,
    "",
    `  Lumi v${LumiInfo.version} · Bun ${Bun.version} · ${stats.modules} modules`,
    `  ${stats.guilds} servers · ${stats.members} members · ${stats.channels} channels`,
    ...(inviteUrl ? [`  Invite: ${inviteUrl}`] : []),
    `  Source: ${LumiInfo.github}`,
    "",
  ];
  console.log(lines.join("\n"));
}
