import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import semver from "semver";
import { LumiInfo } from "#src/lib/utilities/Version.js";
import { isValidDependencySpec } from "#src/lib/module-system/Dependencies.js";
import { FieldType } from "#src/contracts/Config.js";

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

const configFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string(),
  type: z.nativeEnum(FieldType),
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
  configFields: z.array(configFieldSchema),
  author: z.array(z.string().min(1)).min(1),
  requirements: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  min_bot_version: z.string().optional(),
  max_bot_version: z.string().optional(),
  end_user_data_statement: z.string(),
  hidden: z.boolean().optional(),
  disabled: z.boolean().optional(),
  install_msg: z.string().optional(),
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

const ImportRe =
  /\b(?:import(?:\s+type)?\s+(?:(?:\{[^}]*\}|[\w*]+(?:\s+as\s+[\w]+)?)\s+from\s+)?|export(?:\s+type)?\s+(?:\{[^}]*\}|\*)\s+from\s+)["']([^"'\r\n]+)["']/g;
const EmbedImportRe =
  /import\s*(?:type\s*)?\{[^}]*\bEmbedBuilder\b[^}]*\}\s*from\s*["'](?:discord\.js|@discordjs\/builders)["']/;

const TimerRe =
  /(?:(?:const|let|var)\s+(\w+)\s*=\s*|([\w$][\w$.]*)\s*=\s*)?\b(setInterval|setTimeout)\s*\(/g;

const ListenerRe = /\.(?:on|addListener)\s*\(\s*["'`]/;
const ListenerCleanupRe =
  /\b(?:onUnload|dispose|removeListener|removeAllListeners)\b|\.off\s*\(/;

const GlobalLetRe = /^(?:export\s+)?let\s+(\w+)\b/gm;

const GlobalCollectionRe =
  /^(?:export\s+)?const\s+(\w+)\s*(?::\s*[^=;]+)?=\s*(?:\[\s*\]|new\s+Map\s*\(\s*\)|new\s+Set\s*\(\s*\))/gm;

const ReservedDeclKeywordRe =
  /\b(?:function|const|let|var|class|interface|type|enum)\s+(lumi_\w+|__lumi\w*)/g;
const ReservedMemberRe =
  /^\s*(?:(?:public|private|protected|static|async|readonly|get|set)\s+)*(lumi_\w+|__lumi\w*)\s*[(:=?;]/gm;
const ReservedQuotedRe = /["'](lumi_\w+|__lumi\w*)["']\s*:/g;

function checkReservedPrefixes(src: string, rel: string, warnings: string[]): void {
  const found = new Set<string>();
  for (const re of [ReservedDeclKeywordRe, ReservedMemberRe, ReservedQuotedRe]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      found.add(m[1]!);
    }
  }
  if (found.size > 0) {
    const names = [...found].map((n) => `"${n}"`).join(", ");
    warnings.push(
      `${rel}: declares ${names} with a reserved prefix (lumi_ and __lumi_* are reserved for the framework) - rename it to avoid colliding with future framework members.`,
    );
  }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
        `${rel}: module-level \`let ${m[1]}\` is mutable state shared by every guild this addon runs in, for the life of the process - prefer per-guild persisted storage via your services over an in-memory module-level variable.`,
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

function normalizeVersion(v: string): string | null {
  return semver.valid(v) ?? semver.valid(semver.coerce(v));
}

function compareVersions(
  bound: string,
  currentVersion: string,
  holds: (current: string, bound: string) => boolean,
): boolean {
  const parsedBound = normalizeVersion(bound);
  const current = normalizeVersion(currentVersion);
  if (!parsedBound || !current) return false;
  return holds(current, parsedBound);
}

export function isVersionCompatible(
  minVersion: string,
  currentVersion: string,
): boolean {
  return compareVersions(minVersion, currentVersion, semver.gte);
}

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
  return compareVersions(maxVersion, currentVersion, semver.lte);
}

export async function validateAddon(dir: string): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const base = path.basename(path.resolve(dir));

  const manifestPath = path.join(dir, "manifest.json");
  if (!(await pathExists(manifestPath))) {
    errors.push(
      "Missing manifest.json. An addon is discovered from its manifest - it carries the display metadata, target service, and dependency map without importing addon code.",
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
        if (val.min_bot_version && !isVersionCompatible(val.min_bot_version, LumiInfo.version)) {
          errors.push(
            `manifest.json "min_bot_version" (${val.min_bot_version}) exceeds current Lumi version (${LumiInfo.version}).`,
          );
        }
        const minOverMax =
          val.min_bot_version &&
          val.max_bot_version &&
          normalizeVersion(val.min_bot_version) &&
          normalizeVersion(val.max_bot_version) &&
          semver.gt(
            normalizeVersion(val.min_bot_version)!,
            normalizeVersion(val.max_bot_version)!,
          );
        if (val.max_bot_version && !minOverMax && !isMaxVersionCompatible(val.max_bot_version, LumiInfo.version)) {
          errors.push(
            `manifest.json "max_bot_version" (${val.max_bot_version}) is lower than current Lumi version (${LumiInfo.version}).`,
          );
        }
        for (const tag of val.tags ?? []) {
          if (tag.startsWith("red-") && !/^red-\d+\.\d+-ready$/.test(tag)) {
            warnings.push(
              `manifest.json: tag "${tag}" uses a reserved prefix (only "red-X.Y-ready" passes) - it will be ignored by indexes.`,
            );
          }
        }
        validateDependencySpecs(val.dependencies, "manifest.json", errors);
      }
    } catch (err) {
      errors.push(
        `manifest.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const indexPath = path.join(dir, "Index.ts");
  if (await pathExists(indexPath)) {
    const src = await fs.readFile(indexPath, "utf8");
    if (!/\bdefineModule\s*\(/.test(src))
      errors.push("Index.ts does not define a module (defineModule).");
    if (!/\bexport\b/.test(src))
      errors.push(
        "Index.ts exports nothing (export the `meta` object from defineModule).",
      );
    if (/\bconfigFields\s*:/.test(src))
      warnings.push(
        "Index.ts hand-authors `configFields` - declare a `configSchema` with the cfg.* helpers instead (fields are derived from it).",
      );
  } else {
    errors.push("Missing Index.ts (module entrypoint).");
  }

  const files = (await pathExists(dir)) ? await walkTsFiles(dir) : [];
  const addonRoot = path.resolve(dir);
  for (const file of files) {
    const src = await fs.readFile(file, "utf8");
    const rel = path.relative(dir, file);

    if (EmbedImportRe.test(src) || /\bnew\s+EmbedBuilder\s*\(/.test(src))
      errors.push(
        `${rel}: uses EmbedBuilder - user-facing replies must use the make*Card helpers from the shared card builders (a relative import of src/lib/ui/Cards.js).`,
      );
    if (/\bcontainer\b/.test(src))
      errors.push(
        `${rel}: uses the \`container\` global - take the \`services\` argument your onLoad/onUnload/command run() already receives instead.`,
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
    checkI18nHeuristics(src, rel, warnings);
    checkReservedPrefixes(src, rel, warnings);

    let match: RegExpExecArray | null;
    ImportRe.lastIndex = 0;
    while ((match = ImportRe.exec(src)) !== null) {
      const spec = match[1]!;
      if (/^@lumi-devs\/lumi(\/|$)/.test(spec)) {
        if (/^@lumi-devs\/lumi\/(src\/modules|modules)\//.test(spec)) {
          errors.push(
            `${rel}: imports another module via "${spec}" - addons must be self-contained.`,
          );
          continue;
        }
        if (/^@lumi-devs\/lumi\/(src\/lib|lib)\/(prisma|database|rpc|client|event-bus)\//.test(spec)) {
          errors.push(
            `${rel}: imports bot internals via "${spec}" - go through the \`services\` argument your hooks receive instead of reaching into the database, RPC, or client wiring directly.`,
          );
          continue;
        }
        continue;
      }
      if (/^(lumi|@lumi\/|@lumi-devs\/)/.test(spec)) {
        errors.push(
          `${rel}: imports "${spec}", which does not resolve - import from "@lumi-devs/lumi" instead.`,
        );
        continue;
      }
      if (spec.startsWith("#")) {
        errors.push(
          `${rel}: imports "${spec}", which does not resolve - addons must import from "@lumi-devs/lumi" instead of internal aliases.`,
        );
        continue;
      }
      if (spec.startsWith(".")) {
        const resolved = path.resolve(path.dirname(file), spec);
        if (/\/src\/lib\/(prisma|database|rpc|client|event-bus)\//.test(resolved)) {
          errors.push(
            `${rel}: imports bot internals via "${spec}" - go through the \`services\` argument your hooks receive instead of reaching into the database, RPC, or client wiring directly.`,
          );
          continue;
        }
        if (
          resolved !== addonRoot &&
          !resolved.startsWith(addonRoot + path.sep) &&
          !/\/src\/(lib|contracts)\//.test(resolved)
        )
          errors.push(
            `${rel}: relative import "${spec}" escapes the addon directory - shared code must come from src/lib or src/contracts; sibling modules stay off-limits.`,
          );
      }
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
  if (await pathExists(path.join(target, "manifest.json"))) {
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
    if (await pathExists(path.join(child, "manifest.json")))
      results.set(entry.name, await validateAddon(child));
  }
  return results;
}

const ReplyRe =
  /\.(?:reply|replySuccess|replyError|replyWarning|replyInfo|replyEmpty)\s*\(|interaction\.reply\s*\(|message\.reply\s*\(|channel\.send\s*\(/;

const LocaleRe =
  /fetchT|fetchTyped|getT|translate\s*\(|applyLocalizedBuilder/;

function checkI18nHeuristics(src: string, rel: string, warnings: string[]): void {
  if (!ReplyRe.test(src)) return;
  if (LocaleRe.test(src)) return;
  warnings.push(
    `${rel}: user-facing reply without the locale pipeline (no fetchT/fetchTyped/getT/translate found) - fetch a translator (ctx.fetchT()/fetchTyped()) and pass t("namespace:key") strings instead of hardcoded reply text.`,
  );
}
