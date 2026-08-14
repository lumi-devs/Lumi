import { promises as fs } from "node:fs";
import path from "node:path";
import { s } from "@sapphire/shapeshift";
import semver from "semver";
import { LumiInfo } from "#utilities/misc.js";

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

const configFieldSchema = s.object({
  key: s.string().lengthGreaterThanOrEqual(1),
  label: s.string(),
  type: s.enum([
    "BOOLEAN",
    "NUMBER",
    "STRING",
    "ENUM",
    "CHANNEL",
    "ROLE",
    "USER",
  ]),
  description: s.string(),
  default: s.unknown().optional(),
  choices: s.array(s.string()).optional(),
  required: s.boolean().optional(),
  channelTypes: s.array(s.number()).optional(),
  list: s.boolean().optional(),
});

const manifestSchema = s.object({
  name: s.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  displayName: s.string().lengthGreaterThanOrEqual(1),
  emoji: s.string(),
  description: s.string(),
  version: s.string().regex(/^\d+\.\d+\.\d+/),
  disableable: s.boolean().optional(),
  dependencies: s.array(s.string()).optional(),
  conflicts: s.array(s.string()).optional(),
  configOverrides: s.boolean().optional(),
  targetService: s.enum(["worker", "gateway", "scheduler", "api"]),
  subStores: s.array(s.string()),
  configFields: s.array(configFieldSchema),
});

const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", "build"]);

export async function pathExists(p: string): Promise<boolean> {
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

// ── Memory-leak heuristics ──────────────────────────────────────────────────
// Best-effort, regex-level static checks for the leak shapes that come up
// most often in long-running addon code: timers nobody clears, listeners
// nobody removes, and module-level collections nobody bounds. Source text
// can't prove any of these actually leak (the clear/cleanup call might live
// in a helper this file imports, a base class, etc.) so every finding here is
// a warning, same severity tier as the internal-path-import check above -
// never a hard failure.

const TIMER_RE =
  /(?:(?:const|let|var)\s+(\w+)\s*=\s*|([\w$][\w$.]*)\s*=\s*)?\b(setInterval|setTimeout)\s*\(/g;

const LISTENER_RE = /\.(?:on|addListener)\s*\(\s*["'`]/;
const LISTENER_CLEANUP_RE =
  /\b(?:onUnload|dispose|\.off\s*\(|removeListener|removeAllListeners)\b/;

// Anchored at true line-start (no leading whitespace) as a cheap proxy for
// "module scope" without a real parser - matches the formatting this repo
// (and generated addon scaffolds) actually use.
const GLOBAL_LET_RE = /^(?:export\s+)?let\s+(\w+)\b/gm;

const GLOBAL_COLLECTION_RE =
  /^(?:export\s+)?const\s+(\w+)\s*(?::\s*[^=;]+)?=\s*(?:\[\s*\]|new\s+Map\s*\(\s*\)|new\s+Set\s*\(\s*\))/gm;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Appends best-effort memory-leak warnings for one addon source file to `warnings`. */
function checkLeakHeuristics(src: string, rel: string, warnings: string[]): void {
  TIMER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TIMER_RE.exec(src)) !== null) {
    const varName = m[1] ?? m[2];
    const fn = m[3]!;
    const clearFn = fn === "setInterval" ? "clearInterval" : "clearTimeout";

    if (!varName) {
      warnings.push(
        `${rel}: \`${fn}(...)\` return value isn't stored in a variable, so it can never be passed to \`${clearFn}\` - it will keep firing for the life of the process.`,
      );
      continue;
    }

    const clearRe = new RegExp(`\\b${clearFn}\\s*\\(\\s*${escapeRe(varName)}\\b`);
    if (!clearRe.test(src)) {
      warnings.push(
        `${rel}: \`${varName}\` holds a ${fn} handle but no \`${clearFn}(${varName})\` appears in this file - confirm it's cleared somewhere (e.g. onUnload) or the timer leaks for the process lifetime.`,
      );
    }
  }

  if (LISTENER_RE.test(src) && !LISTENER_CLEANUP_RE.test(src)) {
    warnings.push(
      `${rel}: registers a listener via .on(...)/.addListener(...) but this file has no onUnload/dispose/.off(/.removeListener( - confirm it's torn down on module unload, or reloading the addon stacks duplicate listeners on the same emitter.`,
    );
  }

  GLOBAL_LET_RE.lastIndex = 0;
  while ((m = GLOBAL_LET_RE.exec(src)) !== null) {
    warnings.push(
      `${rel}: module-level \`let ${m[1]}\` is mutable state shared by every guild this addon runs in, for the life of the process - prefer per-guild storage (container.db.guildKV / container.redis) over an in-memory module-level variable.`,
    );
  }

  GLOBAL_COLLECTION_RE.lastIndex = 0;
  while ((m = GLOBAL_COLLECTION_RE.exec(src)) !== null) {
    const name = m[1]!;
    const escaped = escapeRe(name);
    const growsRe = new RegExp(`\\b${escaped}\\.(?:push|set|add)\\s*\\(`);
    if (!growsRe.test(src)) continue;

    const boundedRe = new RegExp(
      `\\b${escaped}\\.(?:delete|shift|pop|clear|splice)\\s*\\(|\\b${escaped}\\.(?:length|size)\\s*[<>]`,
    );
    if (!boundedRe.test(src)) {
      warnings.push(
        `${rel}: module-level \`${name}\` is pushed/set/added to but this file never trims it (.delete/.shift/.pop/.clear/.splice, or a .length/.size bounds check) - it can grow unbounded for the process lifetime.`,
      );
    }
  }
}

/** Coerces a loose version string (`v` prefix, missing segments, etc.) to a strict semver, if possible. */
function normalizeVersion(v: string): string | null {
  return semver.valid(v) ?? semver.valid(semver.coerce(v));
}

/**
 * True when `currentVersion` satisfies `minVersion` (i.e. `currentVersion >= minVersion`),
 * per the semver spec - this correctly handles pre-release tags (`1.0.1-beta` ranks
 * between `1.0.0` and `1.0.1`), build metadata (`1.0.1+build.5`), and `v`-prefixed
 * versions. An unparseable version on either side is treated as incompatible.
 */
function isVersionCompatible(
  minVersion: string,
  currentVersion: string,
): boolean {
  const min = normalizeVersion(minVersion);
  const current = normalizeVersion(currentVersion);
  if (!min || !current) return false;
  return semver.gte(current, min);
}

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
        errors.push(`info.json: (root) - ${parsed.error.message}`);
      } else {
        const val = parsed.unwrap();
        if (val.name !== base) {
          errors.push(
            `info.json "name" (${val.name}) must match the directory name (${base}).`,
          );
        }
        if (val.min_bot_version && !isVersionCompatible(val.min_bot_version, LumiInfo.version)) {
          errors.push(
            `info.json "min_bot_version" (${val.min_bot_version}) exceeds current Lumi version (${LumiInfo.version}).`,
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

  const manifestPath = path.join(dir, "manifest.json");
  if (await pathExists(manifestPath)) {
    try {
      const manifest = JSON.parse(
        await fs.readFile(manifestPath, "utf8"),
      ) as unknown;
      const parsed = manifestSchema.run(manifest);
      if (parsed.isErr()) {
        errors.push(`manifest.json: (root) - ${parsed.error.message}`);
      } else {
        const val = parsed.unwrap();
        if (val.name !== base) {
          errors.push(
            `manifest.json "name" (${val.name}) must match the directory name (${base}).`,
          );
        }
      }
    } catch (err) {
      errors.push(
        `manifest.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
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
        "index.ts hand-authors `configFields` - declare a `configSchema` with the cfg.* helpers instead (fields are derived from it).",
      );
  } else {
    errors.push("Missing index.ts (module entrypoint).");
  }

  if (await pathExists(path.join(dir, "tasks"))) {
    errors.push(
      'Found a "tasks/" directory - BullMQ pieces MUST live in "scheduled-tasks/" (a "tasks/" directory is silently never scanned).',
    );
  }

  const files = (await pathExists(dir)) ? await walkTsFiles(dir) : [];
  const addonRoot = path.resolve(dir);
  for (const file of files) {
    const src = await fs.readFile(file, "utf8");
    const rel = path.relative(dir, file);

    if (EMBED_IMPORT_RE.test(src) || /\bnew\s+EmbedBuilder\s*\(/.test(src))
      errors.push(
        `${rel}: uses EmbedBuilder - user-facing replies must use the make*Card helpers from "lumi".`,
      );
    if (/\bcontainer\.prisma\b/.test(src))
      errors.push(
        `${rel}: touches container.prisma - addons get no schema; persist via container.db.guildKV or container.redis.`,
      );
    if (/\bstores\.registerPath\s*\(/.test(src))
      warnings.push(
        `${rel}: calls stores.registerPath - the Downloader already registers the addon path; remove this.`,
      );

    checkLeakHeuristics(src, rel, warnings);

    let match: RegExpExecArray | null;
    IMPORT_RE.lastIndex = 0;
    while ((match = IMPORT_RE.exec(src)) !== null) {
      const spec = match[1]!;
      if (spec.startsWith("#modules/")) {
        errors.push(
          `${rel}: imports another module via "${spec}" - addons must be self-contained.`,
        );
        continue;
      }
      if (/^#(core|lib|utilities|database|root)\//.test(spec)) {
        errors.push(
          `${rel}: imports Lumi's internal path "${spec}" directly - addons are restricted to the public API surface: "lumi" (Module/DefineModule/cfg/Service), "lumi/commands" (BaseCommand/BaseSubcommand/CommandContext), "lumi/permissions", "lumi/scheduling", "lumi/ui" (cards/Emojis/pagination), or "lumi/utils".`,
        );
      }
      if (spec.startsWith(".")) {
        const resolved = path.resolve(path.dirname(file), spec);
        if (
          resolved !== addonRoot &&
          !resolved.startsWith(addonRoot + path.sep)
        )
          errors.push(
            `${rel}: relative import "${spec}" escapes the addon directory - move shared code into the addon or import from "lumi".`,
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
  if (!(await pathExists(target))) {
    return results;
  }
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
