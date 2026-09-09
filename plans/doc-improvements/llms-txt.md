# llms.txt Endpoint

## What it is

A plain-text file at `https://docs.lumidiscord.com/llms.txt` (or wherever the docs live)
that describes Lumi's capabilities in a format AI assistants can index. Instant discoverability
for users asking ChatGPT/Claude "how do I configure Lumi logging".

See: https://llmstxt.org/ for the convention.

## Implementation

New Next.js Route Handler: `apps/docs/src/app/llms.txt/route.ts`

```ts
import { NextResponse } from "next/server";
// generated at build time from scripts/generate-content.ts
import { modules } from "../generated/modules";
import { commands } from "../generated/commands";

export const dynamic = "force-static";

export function GET() {
  const lines: string[] = [
    "# Lumi",
    "",
    "Lumi is a Discord bot for community management.",
    "",
    "## Modules",
    "",
    ...modules.map(m => `- **${m.displayName}**: ${m.short}`),
    "",
    "## Commands",
    "",
    ...commands.map(c => `- \`/${c.name}\`: ${c.description}`),
  ];
  return new NextResponse(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
```

## File

`apps/docs/src/app/llms.txt/route.ts` — new file, ~30 lines

No DB, no auth, no build changes. The generated `modules.ts` and `commands.ts` already exist
from `scripts/generate-content.ts`.
