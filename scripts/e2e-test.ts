import { container } from "@sapphire/framework";
import "../packages/core/src/lib/client/setup.ts";
import { LumiClient } from "../packages/core/src/lib/client/LumiClient.js";
import { config } from "dotenv";
import { runMockedCommand } from "./mock-interaction.js";
import fs from "fs";

config();

async function run() {
  console.log("[QA] Starting Lumi bot...");
  const client = await LumiClient.bootstrap();
  await client.login(process.env.BOT_TOKEN);
  
  console.log(`[QA] Logged in as ${client.user?.tag}`);

  const commands = container.stores.get("commands");
  
  console.log(`[QA] Found ${commands.size} commands. Testing execution paths...`);

  let passed = 0;
  let failed = 0;
  let results = "";

  for (const [name, command] of commands.entries()) {
    console.log(`\nTesting command: ${name}`);
    const res = await runMockedCommand(client, name);
    
    if (res.success) {
      console.log(`✅ [${name}] Success! Reply:`, JSON.stringify(res.replyData).substring(0, 100));
      passed++;
      results += `✅ **${name}** - Passed\n`;
    } else {
      console.log(`❌ [${name}] Failed:`, res.error);
      failed++;
      results += `❌ **${name}** - Failed: ${res.error}\n`;
    }
  }

  console.log("\n[QA] Summary:");
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  
  fs.writeFileSync("test-report.md", `# QA Test Report\n\n${results}`);

  console.log("[QA] Disconnecting...");
  await client.destroy();
  process.exit(0);
}

run().catch(console.error);
