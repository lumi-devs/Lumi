import { NextResponse } from "next/server";
import { commandGroups } from "../../generated/commands";
import { modules } from "../../generated/modules";

export const dynamic = "force-static";

export function GET() {
  const lines: string[] = [
    "# Lumi",
    "",
    "Lumi is a Discord bot for community management.",
    "",
    "## Modules",
    "",
    ...modules.map((m) => `- **${m.displayName}**: ${m.short}`),
    "",
    "## Commands",
    "",
    ...commandGroups.flatMap((g) =>
      g.commands.map((c) => `- \`/${c.name}\`: ${c.description}`),
    ),
  ];
  return new NextResponse(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
