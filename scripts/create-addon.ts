import fs from "node:fs";
import path from "node:path";

function titleCase(str: string): string {
  return str
    .split(/[-_ ]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function parseArgs(): {
  name: string;
  displayName: string;
  description: string;
  category: string;
  targetDir: string;
} {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(`
Lumi Add-on Scaffolder (Redbot-style Cog / Add-on Generator)

Usage:
  bun run addon:create <name> [options]

Options:
  --display="<name>"    Human-readable display name (default: Title Case of name)
  --desc="<text>"       Brief description (default: "A custom add-on for Lumi v2.")
  --category="<cat>"    Category name (default: "Add-ons")
  --dir="<path>"        Output directory (default: "data/addons/<name>")

Examples:
  bun run addon:create welcome-banner
  bun run addon:create poll-master --display="Poll Master" --dir="../lumi-addons/poll-master"
`);
    process.exit(args.length === 0 ? 1 : 0);
  }

  const rawName = args[0]!.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  let displayName = titleCase(rawName);
  let description = `A custom add-on for Lumi v2.`;
  let category = "Add-ons";
  let targetDir = path.resolve("data/addons", rawName);

  for (const arg of args.slice(1)) {
    if (arg.startsWith("--display=")) displayName = arg.slice("--display=".length);
    else if (arg.startsWith("--desc=")) description = arg.slice("--desc=".length);
    else if (arg.startsWith("--category=")) category = arg.slice("--category=".length);
    else if (arg.startsWith("--dir=")) targetDir = path.resolve(arg.slice("--dir=".length));
  }

  return { name: rawName, displayName, description, category, targetDir };
}

function main(): void {
  const { name, displayName, description, category, targetDir } = parseArgs();

  if (fs.existsSync(targetDir)) {
    console.error(`Error: Destination directory "${targetDir}" already exists.`);
    process.exit(1);
  }

  fs.mkdirSync(path.join(targetDir, "tests"), { recursive: true });

  const manifest = {
    apiVersion: 2,
    name,
    displayName,
    emoji: "🔌",
    description,
    version: "1.0.0",
    category,
    entry: "index.ts",
    endUserDataStatement: `This module stores configuration per guild. No personal user data is persisted.`,
    configFields: [
      {
        key: "enabled",
        name: "Module Enabled",
        type: "boolean",
        description: `Toggle ${displayName} functionality.`,
        defaultValue: true,
      },
    ],
  };

  fs.writeFileSync(
    path.join(targetDir, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );

  const indexSource = `import { defineModule } from "@lumi/module-kit";
import { SlashCommandBuilder } from "discord.js";

export default defineModule({
  name: "${name}",
  commands: [
    {
      data: new SlashCommandBuilder()
        .setName("${name}")
        .setDescription("Interact with ${displayName}"),
      execute: async (interaction, { services }) => {
        const guildId = interaction.guildId;
        if (guildId && !services.modules.isEnabled(guildId, "${name}")) {
          await interaction.reply({
            content: "${displayName} is currently disabled in this server.",
            ephemeral: true,
          });
          return;
        }

        await interaction.reply({
          content: \`Hello from **${displayName}**! Operating smoothly on \${interaction.client.user.username}.\`,
          ephemeral: true,
        });
      },
    },
  ],
  listeners: [
    {
      event: "ready",
      handler: async (client, { services }) => {
        services.logger.info("${displayName} add-on loaded successfully.");
      },
    },
  ],
});
`;
  fs.writeFileSync(path.join(targetDir, "index.ts"), indexSource);

  const readmeSource = `# ${displayName}

${description}

## Features
- Modular Discord slash command \`/${name}\`
- Ready event listener
- Configurable guild toggles via \`manifest.configFields\`

## Local Development
1. Link to Lumi: \`bun run addon:link ${targetDir}\`
2. Hot reload while bot runs: \`/owner reload module:${name}\`
3. Validate: \`bun run addon:validate ${targetDir}\`
`;
  fs.writeFileSync(path.join(targetDir, "README.md"), readmeSource);

  const testSource = `import { describe, expect, it } from "vitest";
import mod from "../index.js";

describe("${name} add-on", () => {
  it("exports a valid module definition matching manifest", () => {
    expect(mod.name).toBe("${name}");
    expect(mod.commands).toBeDefined();
    expect(mod.commands?.length).toBeGreaterThan(0);
    expect(mod.listeners).toBeDefined();
  });
});
`;
  fs.writeFileSync(path.join(targetDir, "tests", `${name}.test.ts`), testSource);

  console.log(`
🎉 Successfully scaffolded add-on "${displayName}" in:
   ${targetDir}

Next Steps:
  1. Inspect index.ts and manifest.json
  2. Link into Lumi: bun run addon:link "${targetDir}"
  3. Validate:       bun run addon:validate "${targetDir}"
  4. Test:           bun run dev:bot
`);
}

main();
