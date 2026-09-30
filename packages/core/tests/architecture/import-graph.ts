import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";

export const REPO_ROOT = resolve(import.meta.dir, "../../../..");

export interface ImportRef {
  specifier: string;
  isTypeOnly: boolean;
  kind: "import" | "export" | "dynamic-import" | "require";
}

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const SKIP_DIRS = new Set(["node_modules", "dist", ".next", ".source", "coverage", ".turbo"]);

export function listSourceFiles(rootRelative: string): string[] {
  const root = join(REPO_ROOT, rootRelative);
  const out: string[] = [];

  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walk(full);
        continue;
      }
      const dot = entry.lastIndexOf(".");
      const ext = dot === -1 ? "" : entry.slice(dot);
      if (!SOURCE_EXTENSIONS.has(ext)) continue;
      if (entry.endsWith(".d.ts") || entry.endsWith(".test.ts") || entry.endsWith(".test.tsx")) continue;
      out.push(full);
    }
  };

  walk(root);
  return out;
}

function namedBindingsAreAllTypeOnly(clause: ts.ImportClause | undefined): boolean {
  if (!clause) return false;
  if (clause.isTypeOnly) return true;
  if (clause.name) return false; // default import binds a value
  const bindings = clause.namedBindings;
  if (!bindings) return false;
  if (ts.isNamespaceImport(bindings)) return false;
  return bindings.elements.every((el) => el.isTypeOnly);
}

export function parseImports(filePath: string): ImportRef[] {
  const content = readFileSync(filePath, "utf8");
  const scriptKind = filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, scriptKind);
  const refs: ImportRef[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      refs.push({
        specifier: node.moduleSpecifier.text,
        isTypeOnly: namedBindingsAreAllTypeOnly(node.importClause),
        kind: "import",
      });
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      refs.push({
        specifier: node.moduleSpecifier.text,
        isTypeOnly: node.isTypeOnly,
        kind: "export",
      });
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length > 0 &&
      ts.isStringLiteral(node.arguments[0]!)
    ) {
      refs.push({
        specifier: (node.arguments[0]).text,
        isTypeOnly: false,
        kind: "dynamic-import",
      });
    } else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "require" &&
      node.arguments.length > 0 &&
      ts.isStringLiteral(node.arguments[0]!)
    ) {
      refs.push({
        specifier: (node.arguments[0]).text,
        isTypeOnly: false,
        kind: "require",
      });
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return refs;
}

export type ResolvedKind = "relative" | "alias" | "workspace" | "builtin" | "external" | "unresolved";

export interface ResolvedImport {
  kind: ResolvedKind;
  path?: string; // absolute repo path, when known
  pkg?: string; // workspace/external package name
}

function tryResolveFile(candidateNoExt: string): string | undefined {
  const attempts = [
    candidateNoExt,
    `${candidateNoExt}.ts`,
    `${candidateNoExt}.tsx`,
    join(candidateNoExt, "index.ts"),
    join(candidateNoExt, "index.tsx"),
  ];
  for (const attempt of attempts) {
    if (existsSync(attempt) && statSync(attempt).isFile()) return attempt;
  }
  return undefined;
}

export function resolveSpecifier(fromFile: string, specifier: string): ResolvedImport {
  if (specifier.startsWith(".")) {
    const noExt = specifier.replace(/\.js$/, "").replace(/\.ts$/, "");
    const candidate = resolve(dirname(fromFile), noExt);
    const found = tryResolveFile(candidate);
    return { kind: "relative", path: found ?? candidate };
  }

  if (specifier.startsWith("#lib/") || specifier.startsWith("#modules/")) {
    const [aliasDir, ...rest] = specifier.startsWith("#lib/")
      ? ["lib", specifier.slice("#lib/".length)]
      : ["modules", specifier.slice("#modules/".length)];
    const restPath = rest.join("").replace(/\.js$/, "");
    const candidate = join(REPO_ROOT, "packages/core/src", aliasDir, restPath);
    const found = tryResolveFile(candidate);
    return { kind: "alias", path: found ?? candidate };
  }

  if (specifier.startsWith("node:") || specifier === "bun" || specifier.startsWith("bun:")) {
    return { kind: "builtin", pkg: specifier };
  }

  if (specifier.startsWith("@lumi/")) {
    const pkg = specifier.split("/")[1]!;
    return { kind: "workspace", pkg };
  }

  const external = specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0]!;
  return { kind: "external", pkg: external };
}

export interface Owner {
  type: "package" | "app" | "unknown";
  name: string;
}

const PACKAGE_ROOTS: Array<[string, string]> = [
  ["packages/contracts/src", "contracts"],
  ["packages/core/src", "core"],
  ["packages/observability/src", "observability"],
];

const APP_ROOTS: Array<[string, string]> = [
  ["apps/api/src", "api"],
  ["apps/scheduler/src", "scheduler"],
  ["apps/worker/src", "worker"],
  ["apps/cli/src", "cli"],
  ["apps/docs/src", "docs"],
];

export function ownerOf(absPath: string): Owner {
  const rel = relative(REPO_ROOT, absPath);
  for (const [prefix, name] of PACKAGE_ROOTS) {
    if (rel === prefix || rel.startsWith(`${prefix}/`)) return { type: "package", name };
  }
  for (const [prefix, name] of APP_ROOTS) {
    if (rel === prefix || rel.startsWith(`${prefix}/`)) return { type: "app", name };
  }
  return { type: "unknown", name: rel };
}

const MODULES_ROOT = join(REPO_ROOT, "packages/core/src/modules");

export function moduleNameOf(absPath: string): string | undefined {
  const rel = relative(MODULES_ROOT, absPath);
  if (rel.startsWith("..")) return undefined;
  return rel.split("/")[0];
}

const SDK_ROOT = join(REPO_ROOT, "packages/core/src/lib/addon-sandbox/sdk");

export function isSdkFile(absPath: string): boolean {
  return absPath === SDK_ROOT || absPath.startsWith(`${SDK_ROOT}/`);
}

export function toRepoRelative(absPath: string): string {
  return relative(REPO_ROOT, absPath);
}
