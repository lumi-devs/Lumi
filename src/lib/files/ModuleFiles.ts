import { promises as fs } from "node:fs";
import path from "node:path";

const FilesRoot = path.resolve("data", "files");

export function moduleFilesDir(moduleName: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(moduleName)) {
    throw new Error(`Invalid module name for file storage: ${moduleName}`);
  }
  return path.join(FilesRoot, moduleName.toLowerCase());
}

function resolveIn(dir: string, name: string): string {
  const full = path.resolve(dir, name);
  if (full !== dir && !full.startsWith(dir + path.sep)) {
    throw new Error(`Path escapes module file storage: ${name}`);
  }
  return full;
}

function resolveModuleFile(moduleName: string, name: string): string {
  return resolveIn(moduleFilesDir(moduleName), name);
}

export async function ensureModuleFilesDir(moduleName: string): Promise<string> {
  const dir = moduleFilesDir(moduleName);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function readModuleFile(
  moduleName: string,
  name: string,
): Promise<Buffer | null> {
  const full = resolveModuleFile(moduleName, name);
  try {
    return await fs.readFile(full);
  } catch {
    return null;
  }
}

export async function writeModuleFile(
  moduleName: string,
  name: string,
  data: string | Uint8Array,
): Promise<string> {
  const dir = await ensureModuleFilesDir(moduleName);
  const full = resolveIn(dir, name);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, data);
  return full;
}

export async function deleteModuleFile(
  moduleName: string,
  name: string,
): Promise<boolean> {
  const full = resolveModuleFile(moduleName, name);
  try {
    await fs.unlink(full);
    return true;
  } catch {
    return false;
  }
}

export async function listModuleFiles(
  moduleName: string,
  prefix = "",
): Promise<string[]> {
  const dir = moduleFilesDir(moduleName);
  const out: string[] = [];
  const walk = async (current: string, rel: string): Promise<void> => {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const next = rel ? `${rel}/${entry.name}` : entry.name;
      if (!next.startsWith(prefix)) continue;
      if (entry.isDirectory()) await walk(path.join(current, entry.name), next);
      else out.push(next);
    }
  };
  await walk(dir, "");
  return out.sort();
}
