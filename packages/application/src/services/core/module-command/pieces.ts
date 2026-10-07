import { promises as fs } from "node:fs";
import path from "node:path";

export interface ModulePiecesInfo {
  piecesByStore: Record<string, string[]>;
  totalPieces: number;
}

const Subdirs = [
  "commands",
  "listeners",
  "interactions",
  "utilities",
  "scheduled-tasks",
];

export async function getModulePiecesInfo(
  moduleDir: string,
): Promise<ModulePiecesInfo> {
  const piecesByStore: Record<string, string[]> = {};
  let totalPieces = 0;

  for (const sub of Subdirs) {
    const names = await collectTsFiles(path.join(moduleDir, sub));
    if (names.length > 0) {
      piecesByStore[sub] = names;
      totalPieces += names.length;
    }
  }

  return { piecesByStore, totalPieces };
}

async function collectTsFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await collectTsFiles(full)));
    } else if (
      entry.isFile() &&
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".test.ts")
    ) {
      out.push(path.relative(dir, full).replace(/\.ts$/, ""));
    }
  }
  return out.sort();
}
