import path from "node:path";
import { lstat, mkdir, readlink, rm, symlink } from "node:fs/promises";
import { getRepoRoot } from "@lumi/lib/env.js";

export async function ensureAddonLumiLink(addonDir: string): Promise<void> {
  const nmDir = path.join(addonDir, "node_modules");
  await mkdir(nmDir, { recursive: true });
  const link = path.join(nmDir, "lumi");
  const target = getRepoRoot();
  const current = await readlink(link).catch(() => null);
  if (current && path.resolve(nmDir, current) === target) return;
  const stat = await lstat(link).catch(() => null);
  if (stat && !stat.isSymbolicLink()) return;
  await rm(link, { recursive: true, force: true }).catch(() => undefined);
  await symlink(target, link, "dir");
}
