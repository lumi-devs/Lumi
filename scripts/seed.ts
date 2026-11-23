import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding development data...");

  // Create a test guild
  const guild = await prisma.guild.upsert({
    where: { id: "123456789012345678" },
    update: {},
    create: {
      id: "123456789012345678",
      name: "Lumi Dev Guild",
      icon: null,
      ownerId: "111111111111111111",
      settings: {
        moderation: {
          logChannelId: "777777777777777777",
          dmOnAction: true,
        },
        logging: {
          ignoredChannels: [],
          ignoredEvents: [],
        },
        "roles.autorole": {
          roleIds: ["555555555555555555"],
          botRoleIds: [],
        },
      },
    },
  });
  console.log(`  ✓ Guild: ${guild.name} (${guild.id})`);

  // Enable some modules for the guild
  const modules = [
    {
      module: "moderation",
      config: { logChannelId: "777777777777777777", dmOnAction: true },
    },
    { module: "logging", config: { ignoredChannels: [], ignoredEvents: [] } },
    {
      module: "roles.autorole",
      config: { roleIds: ["555555555555555555"], botRoleIds: [] },
    },
    { module: "utility.reminders", config: {} },
  ];

  for (const item of modules) {
    await prisma.guildModule.upsert({
      where: {
        guildId_module: {
          guildId: guild.id,
          module: item.module,
        },
      },
      update: {
        enabled: true,
        config: item.config,
      },
      create: {
        guildId: guild.id,
        module: item.module,
        enabled: true,
        config: item.config,
      },
    });
    console.log(`  ✓ Module enabled: ${item.module}`);
  }

  // Create a test permit
  const permit = await prisma.permit.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      guildId: guild.id,
      name: "Admin",
      number: 1,
      nodes: ["*"],
      polarity: "Grant",
      position: 100,
      builtin: true,
    },
  });
  console.log(`  ✓ Permit created: ${permit.name} (${permit.id})`);

  console.log("\n✅ Seeding complete!");
  console.log("\nTest credentials:");
  console.log("  Guild ID: 123456789012345678");
  console.log("  Owner ID: 111111111111111111");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
