import { container } from "@sapphire/framework";
import "../packages/core/src/lib/client/setup.ts";
import { LumiClient } from "../packages/core/src/lib/client/LumiClient.js";
import { config } from "dotenv";

config();

async function run() {
  console.log("[QA] Starting Lumi bot for Listener & Job Tests...");
  const client = await LumiClient.bootstrap();
  await client.login(process.env.BOT_TOKEN);
  
  console.log("[QA] Logged in. Emitting dummy events...");

  // Mock message for AFK / Filter
  const mockMessage = {
    author: { bot: false, id: "123" },
    member: { id: "123", roles: { cache: new Map() } },
    guild: { id: "test-guild", roles: { cache: new Map() } },
    content: "hello world",
    mentions: { users: new Map() },
    cleanContent: "hello world"
  } as any;

  console.log("[QA] Emitting messageCreate...");
  client.emit("messageCreate", mockMessage);

  // Mock member for logging
  const mockMember = { id: "123", user: { tag: "test#0000", id: "123" }, guild: { id: "test-guild", name: "Test" } } as any;
  console.log("[QA] Emitting guildMemberAdd...");
  client.emit("guildMemberAdd", mockMember);

  console.log("[QA] Waiting 2 seconds for listeners to fire...");
  await new Promise(r => setTimeout(r, 2000));
  
  console.log("[QA] Done. Disconnecting...");
  await client.destroy();
  process.exit(0);
}

run().catch(console.error);
