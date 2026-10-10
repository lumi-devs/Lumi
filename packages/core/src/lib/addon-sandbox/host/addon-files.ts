import { stat } from "node:fs/promises";
import path from "node:path";

export async function listAddonSourceFiles(dir: string): Promise<string[]> {
  if (!(await stat(dir).then(
    () => true,
    () => false,
  )))
    return [];
  const glob = new Bun.Glob("**/*.{ts,js,mts}");
  const out: string[] = [];
  for await (const file of glob.scan({ cwd: dir, absolute: true, onlyFiles: true })) {
    if (path.basename(file).startsWith("_") || file.endsWith(".d.ts")) continue;
    if (file.endsWith(".test.ts")) continue;
    out.push(file);
  }
  return out.sort();
}
