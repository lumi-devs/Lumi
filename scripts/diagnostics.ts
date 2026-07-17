import { REST, Routes } from "discord.js";
import { config } from "dotenv";
import { prisma } from "../packages/core/src/lib/database/client.js";

config();

async function runDiagnostics() {
  console.log("=== Running Diagnostics ===");

  // 1. Check Database
  console.log("\n1. Checking Database...");
  try {
    await prisma.$connect();
    console.log("✅ Database connection successful!");
    const count = await prisma.guildSettings.count().catch(() => 0);
    console.log(`✅ GuildSettings table accessible (Count: ${count})`);
  } catch (error) {
    console.error("❌ Database connection failed:", error);
  } finally {
    await prisma.$disconnect();
  }

  // 2. Check Discord API & Commands
  console.log("\n2. Checking Discord API & Registered Commands...");
  const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN!);
  try {
    const commands: any = await rest.get(Routes.applicationCommands(process.env.CLIENT_ID!));
    console.log(`✅ Fetched ${commands.length} global slash commands from Discord API.`);
    const cmdNames = commands.map((c: any) => c.name);
    console.log(`Registered Commands: ${cmdNames.join(", ")}`);
    
    if (cmdNames.includes("ping")) {
      console.log("✅ /ping IS registered globally on Discord's side!");
    } else {
      console.log("❌ /ping is MISSING on Discord's side!");
    }
  } catch (error) {
    console.error("❌ Failed to fetch commands from Discord:", error);
  }

  console.log("\nDiagnostics Complete.");
  process.exit(0);
}

runDiagnostics();
