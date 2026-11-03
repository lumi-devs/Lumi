import { prisma } from "@lumi/db";

const ConfigRenames: ReadonlyArray<readonly [from: string, to: string]> = [
  ["security", "security-core"],
  ["logging", "logging-logs"],
  ["roleMenus", "role-menus-menu"],
];

const Supermodules = [
  "security",
  "community",
  "moderation",
  "logging",
  "custom-commands",
  "role-menus",
  "roles",
  "utility",
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const guilds = await prisma.guild.findMany({
  select: { id: true, settings: true },
});

let renamedKeys = 0;
let removedConfigs = 0;

for (const guild of guilds) {
  const settings = isRecord(guild.settings) ? { ...guild.settings } : {};
  let changed = false;

  for (const [from, to] of ConfigRenames) {
    if (!Object.hasOwn(settings, from)) continue;
    const oldValue = settings[from];
    const newValue = settings[to];

    if (isRecord(oldValue) && isRecord(newValue)) {
      settings[to] = { ...oldValue, ...newValue };
    } else {
      settings[to] = newValue ?? oldValue;
    }

    delete settings[from];
    changed = true;
    renamedKeys += 1;
    console.log(`[settings] ${guild.id}: renamed "${from}" -> "${to}"`);
  }

  for (const name of Supermodules) {
    if (!Object.hasOwn(settings, name)) continue;
    delete settings[name];
    changed = true;
    removedConfigs += 1;
    console.log(`[settings] ${guild.id}: removed supermodule config "${name}"`);
  }

  if (changed) {
    await prisma.guild.update({
      where: { id: guild.id },
      data: { settings },
    });
  }
}

const deletedModules = await prisma.guildModule.deleteMany({
  where: { module: { in: [...Supermodules] } },
});

console.log(
  `Done: ${guilds.length} guild(s), ${renamedKeys} key rename(s), ${removedConfigs} supermodule config(s) removed, ${deletedModules.count} guild_modules row(s) deleted.`,
);

await prisma.$disconnect();
