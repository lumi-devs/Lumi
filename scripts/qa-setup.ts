import { Client, GatewayIntentBits, ChannelType, OverwriteType } from "discord.js";
import { config } from "dotenv";

config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

client.once("ready", async () => {
  console.log(`Logged in as ${client.user?.tag}`);

  const guild = client.guilds.cache.first();
  if (!guild) {
    console.error("Bot is not in any guilds! Please invite it first.");
    process.exit(1);
  }

  console.log(`Provisioning test environment in Guild: ${guild.name} (${guild.id})...`);

  // Create Roles
  const roles = await guild.roles.fetch();
  let testerRole = roles.find((r) => r.name === "Lumi Tester");
  if (!testerRole) {
    testerRole = await guild.roles.create({
      name: "Lumi Tester",
      color: "#00FF00",
      reason: "QA Testing",
    });
    console.log("Created role: Lumi Tester");
  }

  let mutedRole = roles.find((r) => r.name === "Muted");
  if (!mutedRole) {
    mutedRole = await guild.roles.create({
      name: "Muted",
      color: "#808080",
      reason: "QA Testing",
    });
    console.log("Created role: Muted");
  }

  // Create Channels
  const channels = await guild.channels.fetch();
  let qaCategory = channels.find((c) => c?.name === "Lumi QA" && c.type === ChannelType.GuildCategory);
  if (!qaCategory) {
    qaCategory = await guild.channels.create({
      name: "Lumi QA",
      type: ChannelType.GuildCategory,
      reason: "QA Testing",
    });
    console.log("Created category: Lumi QA");
  }

  let generalChannel = channels.find((c) => c?.name === "lumi-qa-general" && c.parentId === qaCategory?.id);
  if (!generalChannel) {
    generalChannel = await guild.channels.create({
      name: "lumi-qa-general",
      type: ChannelType.GuildText,
      parent: qaCategory?.id,
      reason: "QA Testing",
    });
    console.log("Created channel: #lumi-qa-general");
  }

  let logsChannel = channels.find((c) => c?.name === "lumi-qa-logs" && c.parentId === qaCategory?.id);
  if (!logsChannel) {
    logsChannel = await guild.channels.create({
      name: "lumi-qa-logs",
      type: ChannelType.GuildText,
      parent: qaCategory?.id,
      reason: "QA Testing",
    });
    console.log("Created channel: #lumi-qa-logs");
  }

  let tempvcCategory = channels.find((c) => c?.name === "QA TempVC" && c.type === ChannelType.GuildCategory);
  if (!tempvcCategory) {
    tempvcCategory = await guild.channels.create({
      name: "QA TempVC",
      type: ChannelType.GuildCategory,
      reason: "QA Testing",
    });
    console.log("Created category: QA TempVC");
  }

  if (generalChannel && generalChannel.isTextBased()) {
    await generalChannel.send(
      `🧪 **QA Environment Provisioned**\n` +
      `You can now execute your test checklist in this channel. Setup complete!`
    );
  }

  console.log("Provisioning complete. Exiting...");
  process.exit(0);
});

client.login(process.env.BOT_TOKEN);
