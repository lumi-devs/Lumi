import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

async function seed() {
  if (process.env.NODE_ENV === 'production') {
    console.error(`${RED}❌ Refusing to run seed in production environment!${RESET}`);
    process.exit(1);
  }

  console.log(`${GREEN}🌱 Starting Lumi development database seeding...${RESET}`);

  // 1. Seed Global Configuration
  console.log(`  ${DIM}→${RESET} Seeding Global Config...`);
  await prisma.global.upsert({
    where: { id: 1 },
    update: {
      botName: 'Lumi Development',
      defaultPrefix: '!',
      maintenanceMode: false,
    },
    create: {
      id: 1,
      botName: 'Lumi Development',
      defaultPrefix: '!',
      maintenanceMode: false,
      maintenanceMessage: 'System undergoing maintenance.',
    },
  });

  // 2. Seed Sample Guilds
  console.log(`  ${DIM}→${RESET} Seeding Sample QA Guild (123456789012345678)...`);
  const sampleGuildId = '123456789012345678';
  await prisma.guild.upsert({
    where: { id: sampleGuildId },
    update: {
      prefix: '!',
      locale: 'en-US',
      timezone: 'UTC',
    },
    create: {
      id: sampleGuildId,
      prefix: '!',
      modRoleId: '999888777666555444',
      adminRoleId: '111222333444555666',
      modLogChannelId: '555444333222111000',
      locale: 'en-US',
      timezone: 'UTC',
    },
  });

  // 3. Seed Guild Module States & Configs
  console.log(`  ${DIM}→${RESET} Seeding Module States & Configs...`);
  const modules = ['core', 'mod', 'filter', 'utility', 'afk', 'tempvc', 'logging', 'dashboard'];
  for (const moduleName of modules) {
    await prisma.guildModuleState.upsert({
      where: {
        guildId_moduleName: {
          guildId: sampleGuildId,
          moduleName,
        },
      },
      update: { enabled: true },
      create: {
        guildId: sampleGuildId,
        moduleName,
        enabled: true,
      },
    });
  }

  // 4. Seed Wick-style Custom Permits
  console.log(`  ${DIM}→${RESET} Seeding Custom Permits...`);
  await prisma.customPermit.upsert({
    where: {
      id: `${sampleGuildId}_mod_permit`,
    },
    update: { node: 'mod.*' },
    create: {
      id: `${sampleGuildId}_mod_permit`,
      guildId: sampleGuildId,
      targetId: '999888777666555444', // modRoleId
      targetType: 'ROLE',
      node: 'mod.*',
      grantedBy: '100000000000000001',
    },
  });

  // 5. Seed Moderation Cases
  console.log(`  ${DIM}→${RESET} Seeding Sample Moderation Cases...`);
  await prisma.moderationCase.upsert({
    where: {
      guildId_caseId: {
        guildId: sampleGuildId,
        caseId: 1,
      },
    },
    update: {},
    create: {
      guildId: sampleGuildId,
      caseId: 1,
      action: 'WARN',
      targetId: '200000000000000002',
      moderatorId: '100000000000000001',
      reason: 'Automated seed test warning for anti-spam threshold.',
    },
  });

  console.log(`${GREEN}✅ Database seeding complete!${RESET}`);
}

seed()
  .catch((err) => {
    console.error(`${RED}❌ Seeding failed:${RESET}`, err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
