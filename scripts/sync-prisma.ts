import fs from "node:fs";
import path from "node:path";

function syncPrisma(): void {
  const bunDir = path.resolve("node_modules/.bun");
  if (!fs.existsSync(bunDir)) return;

  const entries = fs
    .readdirSync(bunDir)
    .filter((entry) => entry.startsWith("@prisma+client@"));

  let sourcePrisma: string | null = null;
  for (const entry of entries) {
    const candidate = path.join(bunDir, entry, "node_modules/.prisma");
    if (fs.existsSync(candidate)) {
      sourcePrisma = candidate;
      break;
    }
  }

  if (!sourcePrisma) return;

  for (const entry of entries) {
    const target = path.join(bunDir, entry, "node_modules/.prisma");
    if (target !== sourcePrisma) {
      fs.cpSync(sourcePrisma, target, { recursive: true, force: true });
    }
  }
}

syncPrisma();
