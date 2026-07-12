import { promises as fs } from "node:fs";
import path from "node:path";
import { s } from "@sapphire/shapeshift";

/** Static, import-free structural validation for an addon directory. */
export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

const infoSchema = s.object({
  name: s.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  author: s
    .array(s.string().lengthGreaterThanOrEqual(1))
    .lengthGreaterThanOrEqual(1),
  description: s.string().lengthGreaterThanOrEqual(1),
  short: s.string().lengthGreaterThanOrEqual(1),
  version: s.string().regex(/^\d+\.\d+\.\d+/),
  requirements: s.array(s.string()).optional(),
  tags: s.array(s.string()).optional(),
  min_bot_version: s.string().optional(),
  hidden: s.boolean().optional(),
});

const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", "build"]);

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function walkTsFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      out.push(...(await walkTsFiles(full)));
    } else if (
      entry.isFile() &&
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".test.ts")
    ) {
      out.push(full);
    }
  }
  return out;
}

const IMPORT_RE = /(?:import|export)[^"'`]*?["']([^"'`]+)["']/g;
const EMBED_IMPORT_RE =
  /import\s*(?:type\s*)?\{[^}]*\bEmbedBuilder\b[^}]*\}\s*from\s*["'](?:discord\.js|@discordjs\/builders)["']/;

/** Validate a single addon directory. Returns collected errors + warnings. */
export async function validateAddon(dir: string): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const base = path.basename(path.resolve(dir));

  const infoPath = path.join(dir, "info.json");
  if (await pathExists(infoPath)) {
    try {
      const info = JSON.parse(await fs.readFile(infoPath, "utf8")) as unknown;
      const parsed = infoSchema.run(info);
      if (parsed.isErr()) {
        errors.push(`info.json: (root) — ${parsed.error.message}`);
      } else {
        const val = parsed.unwrap();
        if (val.name !== base) {
          errors.push(
            `info.json "name" (${val.name}) must match the directory name (${base}).`,
          );
        }
      }
    } catch (err) {
      errors.push(
        `info.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } else {
    errors.push("Missing info.json (Downloader metadata).");
  }

  const indexPath = path.join(dir, "index.ts");
  if (await pathExists(indexPath)) {
    const src = await fs.readFile(indexPath, "utf8");
    if (!/@DefineModule\s*\(/.test(src))
      errors.push("index.ts does not use the @DefineModule decorator.");
    if (!/\bexport\b/.test(src))
      errors.push(
        "index.ts exports nothing (the module class must be exported).",
      );
    if (/\bconfigFields\s*:/.test(src))
      warnings.push(
        "index.ts hand-authors `configFields` — declare a `configSchema` with the cfg.* helpers instead (fields are derived from it).",
      );
  } else {
    errors.push("Missing index.ts (module entrypoint).");
  }

  if (await pathExists(path.join(dir, "tasks"))) {
    errors.push(
      'Found a "tasks/" directory — BullMQ pieces MUST live in "scheduled-tasks/" (a "tasks/" directory is silently never scanned).',
    );
  }

  const files = (await pathExists(dir)) ? await walkTsFiles(dir) : [];
  const addonRoot = path.resolve(dir);
  for (const file of files) {
    const src = await fs.readFile(file, "utf8");
    const rel = path.relative(dir, file);

    if (EMBED_IMPORT_RE.test(src) || /\bnew\s+EmbedBuilder\s*\(/.test(src))
      errors.push(
        `${rel}: uses EmbedBuilder — user-facing replies must use the make*Card helpers from #utilities/cards.js.`,
      );
    if (/\bcontainer\.prisma\b/.test(src))
      errors.push(
        `${rel}: touches container.prisma — addons get no schema; persist via container.db.guildKV or container.redis.`,
      );
    if (/\bstores\.registerPath\s*\(/.test(src))
      warnings.push(
        `${rel}: calls stores.registerPath — the Downloader already registers the addon path; remove this.`,
      );

    let match: RegExpExecArray | null;
    IMPORT_RE.lastIndex = 0;
    while ((match = IMPORT_RE.exec(src)) !== null) {
      const spec = match[1]!;
      if (spec.startsWith("#modules/")) {
        errors.push(
          `${rel}: imports another module via "${spec}" — addons must be self-contained.`,
        );
        continue;
      }
      if (spec.startsWith(".")) {
        const resolved = path.resolve(path.dirname(file), spec);
        if (
          resolved !== addonRoot &&
          !resolved.startsWith(addonRoot + path.sep)
        )
          errors.push(
            `${rel}: relative import "${spec}" escapes the addon directory — move shared code into the addon or use #core/#utilities/#lib aliases.`,
          );
      }
    }
  }

  return { errors, warnings };
}

/** Validate one addon or a directory of addons. */
export async function validateAddonOrRepo(
  target: string,
): Promise<Map<string, ValidationResult>> {
  const results = new Map<string, ValidationResult>();
  if (await pathExists(path.join(target, "info.json"))) {
    results.set(
      path.basename(path.resolve(target)),
      await validateAddon(target),
    );
    return results;
  }
  const entries = await fs.readdir(target, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const child = path.join(target, entry.name);
    if (await pathExists(path.join(child, "info.json")))
      results.set(entry.name, await validateAddon(child));
  }
  return results;
}
