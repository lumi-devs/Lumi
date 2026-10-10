import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import semver from "semver";
import { AddonDiscordCapabilities } from "@lumi/contracts";
import { LumiInfo } from "@lumi/lib/utilities/version.js";
import { unknownDiscordCapabilities } from "@lumi/lib/addon-sandbox/host/capabilities.js";
import { isValidDependencySpec } from "@lumi/lib/module-system/dependencies.js";

/** Static, import-free structural validation for an addon directory. */
export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

const infoSchema = z.object({
  name: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  author: z
    .array(z.string().min(1))
    .min(1),
  description: z.string().min(1),
  short: z.string().min(1).optional(),
  version: z.string().regex(/^\d+\.\d+\.\d+/),
  dependencies: z.array(z.string()).optional(),
  conflicts: z.array(z.string()).optional(),
  requirements: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  min_bot_version: z.string().optional(),
  max_bot_version: z.string().optional(),
  end_user_data_statement: z.string(),
  hidden: z.boolean().optional(),
});

const configFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string(),
  type: z.enum([
    "BOOLEAN",
    "NUMBER",
    "STRING",
    "ENUM",
    "CHANNEL",
    "ROLE",
    "USER",
  ]),
  description: z.string(),
  default: z.unknown().optional(),
  choices: z.array(z.string()).optional(),
  required: z.boolean().optional(),
  channelTypes: z.array(z.number()).optional(),
  claimable: z.boolean().optional(),
  templateVars: z.array(z.string()).optional(),
  pairedWith: z.string().optional(),
  enabledBy: z.string().optional(),
  list: z.boolean().optional(),
});

const manifestSchema = z.object({
  name: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  displayName: z.string().min(1),
  emoji: z.string(),
  description: z.string(),
  version: z.string().regex(/^\d+\.\d+\.\d+/),
  disableable: z.boolean().optional(),
  dependencies: z.array(z.string()).optional(),
  conflicts: z.array(z.string()).optional(),
  configOverrides: z.boolean().optional(),
  targetUtility: z.enum(["worker", "gateway", "scheduler", "api"]),
  subStores: z.array(z.string()),
  configFields: z.array(configFieldSchema),
});

const IgnoredDirs = new Set(["node_modules", ".git", "dist", "build"]);

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
      if (IgnoredDirs.has(entry.name)) continue;
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

const ImportRe = /(?:import|export)[^"'`]*?["']([^"'`]+)["']/g;
const EmbedImportRe =
  /import\s*(?:type\s*)?\{[^}]*\bEmbedBuilder\b[^}]*\}\s*from\s*["'](?:discord\.js|@discordjs\/builders)["']/;

// Best-effort, regex-level static checks for the leak shapes that come up
// most often in long-running addon code: timers nobody clears, listeners
// nobody removes, and module-level collections nobody bounds. Source text
// can't prove any of these actually leak (the clear/cleanup call might live
// in a helper this file imports, a base class, etc.) so every finding here is
// a warning, same severity tier as the internal-path-import check above -
// never a hard failure.

const TimerRe =
  /(?:(?:const|let|var)\s+(\w+)\s*=\s*|([\w$][\w$.]*)\s*=\s*)?\b(setInterval|setTimeout)\s*\(/g;

const ListenerRe = /\.(?:on|addListener)\s*\(\s*["'`]/;
const ListenerCleanupRe =
  /\b(?:onUnload|dispose|removeListener|removeAllListeners)\b|\.off\s*\(/;

// Anchored at true line-start (no leading whitespace) as a cheap proxy for
// "module scope" without a real parser - matches the formatting this repo
// (and generated addon scaffolds) actually use.
const GlobalLetRe = /^(?:export\s+)?let\s+(\w+)\b/gm;

const GlobalCollectionRe =
  /^(?:export\s+)?const\s+(\w+)\s*(?::\s*[^=;]+)?=\s*(?:\[\s*\]|new\s+Map\s*\(\s*\)|new\s+Set\s*\(\s*\))/gm;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Appends best-effort memory-leak warnings for one addon source file to `warnings`. */
function checkLeakHeuristics(src: string, rel: string, warnings: string[]): void {
  TimerRe.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TimerRe.exec(src)) !== null) {
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

  if (ListenerRe.test(src) && !ListenerCleanupRe.test(src)) {
    warnings.push(
      `${rel}: registers a listener via .on(...)/.addListener(...) but this file has no onUnload/dispose/.off(/.removeListener( - confirm it's torn down on module unload, or reloading the addon stacks duplicate listeners on the same emitter.`,
    );
  }

  GlobalLetRe.lastIndex = 0;
  while ((m = GlobalLetRe.exec(src)) !== null) {
    warnings.push(
      `${rel}: module-level \`let ${m[1]}\` is mutable state shared by every guild this addon runs in, for the life of the process - prefer per-guild storage ("lumi/kv", "lumi/valkey") over an in-memory module-level variable.`,
    );
  }

  GlobalCollectionRe.lastIndex = 0;
  while ((m = GlobalCollectionRe.exec(src)) !== null) {
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

const BareBuiltin = new Set(
  "fs path os util events stream buffer crypto timers url querystring string_decoder repl tty readline perf_hooks async_hooks assert punycode constants v8 inspector sqlite sys module cluster dgram dns http https http2 tls net vm process child_process worker_threads".split(
    " ",
  ),
);
const DangerousBunImportRe = /^bun:(?:ffi|shell|sqlite)$/;

const BreaksWhenUsed = new Set(["crypto", "url", "timers", "timers/promises", "async_hooks"]);

function importedNames(statement: string): string[] {
  const m = /import\s*(?:type\s*)?(?:([A-Za-z_$][\w$]*)\s*,\s*)?(?:\*\s*as\s*([A-Za-z_$][\w$]*)|\{([^}]*)\})?/.exec(
    statement,
  );
  if (!m) return [];
  const names = [m[1], m[2]].filter((n): n is string => !!n);
  for (const part of (m[3] ?? "").split(",")) {
    const local = part.trim().split(/\s+as\s+/).pop()!.trim();
    if (/^[A-Za-z_$][\w$]*$/.test(local)) names.push(local);
  }
  return names;
}

const DangerousGlobalRes: RegExp[] = [
  /(?<!\.)\bfetch\s*\(/,
  /\bnew\s+WebSocket\s*\(/,
  /\bBun\s*\./,
  /\bgetBuiltinModule\s*\(/,
  /\bprocess\s*\.\s*(?:dlopen|binding)\b/,
  /\bnew\s+Worker\s*\(/,
  /\brequire\s*\(\s*["'](?:node:)?(?:fs|net|https?|child_process|worker_threads|vm|sqlite)/,
];

function checkDangerousImportSpec(
  spec: string,
  statement: string,
  src: string,
  rel: string,
  warnings: string[],
  errors: string[],
): void {
  const bare = spec.startsWith("node:") ? spec.slice("node:".length).split("/")[0] : spec.split("/")[0];
  if (!spec.startsWith("node:") && !BareBuiltin.has(bare!) && !DangerousBunImportRe.test(spec))
    return;
  if (BreaksWhenUsed.has(bare!)) {
    const rest = src.replace(statement, "");
    const used = importedNames(statement).some(
      (name) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[.(]`).test(rest),
    );
    if (used) {
      errors.push(
        `${rel}: imports "${spec}" and uses it - that builtin resolves to a broken shim inside the isolate; use the "lumi/*" SDK instead ("lumi/utils" for randomness, hashing, and sleep).`,
      );
      return;
    }
  }
  warnings.push(
    `${rel}: imports "${spec}" - no Node.js builtin exists inside the isolate; use the "lumi/*" SDK instead ("lumi/kv", "lumi/discord", "lumi/scheduling", "lumi/net", "lumi/utils"), or flag it for a human reviewer.`,
  );
}

function checkDangerousGlobals(src: string, rel: string, warnings: string[]): void {
  for (const re of DangerousGlobalRes) {
    const match = re.exec(src);
    if (match)
      warnings.push(
        `${rel}: uses \`${match[0].trim()}\` - this reaches outside the addon sandbox (raw network, subprocesses, or loader bypasses); use the "lumi/*" SDK instead ("lumi/net" for HTTP, with the \`network\` capability in manifest.json), or flag it for a human reviewer.`,
      );
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
export function isVersionCompatible(
  minVersion: string,
  currentVersion: string,
): boolean {
  const min = normalizeVersion(minVersion);
  const current = normalizeVersion(currentVersion);
  if (!min || !current) return false;
  return semver.gte(current, min);
}

/**
 * Validates a `dependencies` array's entries are each a plain module name
 * (`"economy"`) or a name with a valid semver range (`"leveling@^1.2.0"`),
 * appending a clear error per malformed entry.
 */
function validateDependencySpecs(
  entries: string[] | undefined,
  source: string,
  errors: string[],
): void {
  for (const entry of entries ?? []) {
    if (!isValidDependencySpec(entry)) {
      errors.push(
        `${source}: "dependencies" entry "${entry}" is not valid - expected a module name ("economy") or a name with a semver range ("leveling@^1.2.0").`,
      );
    }
  }
}

export function isMaxVersionCompatible(
  maxVersion: string,
  currentVersion: string,
): boolean {
  const max = normalizeVersion(maxVersion);
  const current = normalizeVersion(currentVersion);
  if (!max || !current) return false;
  return semver.lte(current, max);
}

export async function validateAddon(dir: string): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const base = path.basename(path.resolve(dir));

  const infoPath = path.join(dir, "info.json");
  if (await pathExists(infoPath)) {
    try {
      const info = JSON.parse(await fs.readFile(infoPath, "utf8")) as unknown;
      const parsed = infoSchema.safeParse(info);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          if (issue.path.length === 0) {
            errors.push(`info.json: (root) - ${issue.message}`);
            continue;
          }
          const key = String(issue.path[0]);
          if (
            key === "end_user_data_statement" &&
            typeof info === "object" &&
            info !== null &&
            (info as Record<string, unknown>).end_user_data_statement === undefined
          ) {
            errors.push(
              `info.json: "end_user_data_statement" is required. You must provide a clear statement explaining what user data this addon collects and why (or state that none is collected).`
            );
          } else {
            errors.push(`info.json: "${key}" - ${issue.message}`);
          }
        }
      } else {
        const val = parsed.data;
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
        if (val.max_bot_version && !isMaxVersionCompatible(val.max_bot_version, LumiInfo.version)) {
          errors.push(
            `info.json "max_bot_version" (${val.max_bot_version}) is lower than current Lumi version (${LumiInfo.version}).`,
          );
        }
        validateDependencySpecs(val.dependencies, "info.json", errors);
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
  if (!(await pathExists(manifestPath))) {
    errors.push(
      "Missing manifest.json. An addon is discovered from its manifest - reading metadata out of index.ts would mean running addon code in the bot's own process.",
    );
  } else {
    try {
      const manifest = JSON.parse(
        await fs.readFile(manifestPath, "utf8"),
      ) as unknown;
      const parsed = manifestSchema.safeParse(manifest);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          if (issue.path.length === 0) {
            errors.push(`manifest.json: (root) - ${issue.message}`);
          } else {
            errors.push(`manifest.json: "${String(issue.path[0])}" - ${issue.message}`);
          }
        }
      } else {
        const val = parsed.data;
        if (val.name !== base) {
          errors.push(
            `manifest.json "name" (${val.name}) must match the directory name (${base}).`,
          );
        }
        validateDependencySpecs(val.dependencies, "manifest.json", errors);
      }
      for (const unknown of unknownDiscordCapabilities(
        (manifest as { capabilities?: unknown }).capabilities,
      )) {
        errors.push(
          `manifest.json: unknown Discord capability "${unknown}". Valid names: ${AddonDiscordCapabilities.join(", ")}.`,
        );
      }
      const caps = (manifest as { capabilities?: unknown }).capabilities;
      if (caps && typeof caps === "object") {
        const c = caps as {
          network?: unknown;
          valkey?: unknown;
          scheduling?: unknown;
          discord?: unknown;
        };
        const broad: string[] = [];
        if (c.network === true) broad.push("network");
        if (c.valkey === true) broad.push("valkey");
        if (c.scheduling === true) broad.push("scheduling");
        if (Array.isArray(c.discord))
          for (const d of c.discord)
            if (
              typeof d === "string" &&
              (d.startsWith("manage") ||
                d === "moderateMembers" ||
                d === "clientPresence" ||
                d === "sendDirectMessage")
            )
              broad.push(`discord:${d}`);
        if (broad.length > 0)
          warnings.push(
            `manifest.json declares broad capabilities (${broad.join(", ")}) - confirm the addon needs each one before enabling it.`,
          );
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
    if (!/\bdefineModule\s*\(/.test(src))
      errors.push("index.ts does not define a module (defineModule).");
    if (!/\bexport\b/.test(src))
      errors.push(
        "index.ts exports nothing (export the `meta` object from defineModule).",
      );
    if (/\bconfigFields\s*:/.test(src))
      warnings.push(
        "index.ts hand-authors `configFields` - declare a `configSchema` with the cfg.* helpers instead (fields are derived from it).",
      );
  } else {
    errors.push("Missing index.ts (module entrypoint).");
  }

  for (const stale of ["tasks", "scheduled-tasks"]) {
    if (await pathExists(path.join(dir, stale))) {
      errors.push(
        `Found a "${stale}/" directory, which is never scanned. A sandboxed addon cannot own a scheduled-task piece - call registerTaskFireHandler() from "lumi/scheduling" in index.ts instead.`,
      );
    }
  }

  const files = (await pathExists(dir)) ? await walkTsFiles(dir) : [];
  const addonRoot = path.resolve(dir);
  for (const file of files) {
    const src = await fs.readFile(file, "utf8");
    const rel = path.relative(dir, file);

    if (EmbedImportRe.test(src) || /\bnew\s+EmbedBuilder\s*\(/.test(src))
      errors.push(
        `${rel}: uses EmbedBuilder - user-facing replies must use the make*Card helpers from "lumi".`,
      );
    if (/\bcontainer\b/.test(src))
      errors.push(
        `${rel}: uses \`container\` - it does not exist in an addon process. Persist via "lumi/kv", read settings via "lumi/config", act on Discord via "lumi/discord".`,
      );
    if (/@DefineModule\s*\(|extends\s+BaseCommand|extends\s+Module\b/.test(src))
      errors.push(
        `${rel}: uses the removed class API (@DefineModule/BaseCommand/Module) - export a \`meta\` object from defineModule() and plain command objects from defineCommand() instead.`,
      );
    if (/\bstores\.registerPath\s*\(/.test(src))
      warnings.push(
        `${rel}: calls stores.registerPath - the Downloader already registers the addon path; remove this.`,
      );

    checkLeakHeuristics(src, rel, warnings);
    checkDangerousGlobals(src, rel, warnings);

    let match: RegExpExecArray | null;
    ImportRe.lastIndex = 0;
    while ((match = ImportRe.exec(src)) !== null) {
      const spec = match[1]!;
      if (spec.startsWith("@lumi/modules/")) {
        errors.push(
          `${rel}: imports another module via "${spec}" - addons must be self-contained.`,
        );
        continue;
      }
      if (/^#(core|lib|utilities|database|root)\//.test(spec) || spec.startsWith("@lumi/lib/")) {
        // Not a boundary, just a better error than a resolution failure at
        // spawn time: an addon process resolves `lumi`/`lumi/*` and nothing
        // else, so these specifiers do not exist for it.
        errors.push(
          `${rel}: imports Lumi's internal path "${spec}", which does not resolve inside an addon process. Use "lumi" and its subpaths.`,
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
      checkDangerousImportSpec(spec, match[0], src, rel, warnings, errors);
    }
  }

  return { errors, warnings };
}

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
