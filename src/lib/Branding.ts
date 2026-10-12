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
  commands: number;
  prefix: string;
  storage: string;
  shards: string;
}

export function printBootBanner(stats: BootStats, inviteUrl: string | null): void {
  const lines = [
    "",
    LUMI_ART,
    "",
    `  Lumi v${LumiInfo.version} · Bun ${Bun.version} · ${stats.modules} modules · ${stats.commands} commands`,
    `  ${stats.guilds} servers · ${stats.members} members · ${stats.channels} channels`,
    `  Prefix ${stats.prefix} · Store ${stats.storage} · Shards ${stats.shards}`,
    ...(inviteUrl ? [`  Invite: ${inviteUrl}`] : []),
    `  Source: ${LumiInfo.github}`,
    "",
  ];
  console.log(lines.join("\n"));
}
