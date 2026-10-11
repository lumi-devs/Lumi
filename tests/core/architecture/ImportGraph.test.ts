import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import {
  REPO_ROOT,
  listSourceFiles,
  moduleNameOf,
  ownerOf,
  parseImports,
  resolveSpecifier,
  toRepoRelative,
  type ImportRef,
} from "./ImportGraph.js";

interface FileImport {
  file: string;
  ref: ImportRef;
}

const SOURCE_DIRS = ["src"];

const allFiles = SOURCE_DIRS.flatMap((dir) => listSourceFiles(dir));

function importsOf(file: string): FileImport[] {
  return parseImports(file).map((ref) => ({ file, ref }));
}

const allImports: FileImport[] = allFiles.flatMap(importsOf);

function formatViolation(file: string, ref: ImportRef, reason: string): string {
  return `${toRepoRelative(file)} -> "${ref.specifier}" (${ref.kind}): ${reason}`;
}

function reportAndAssert(violations: string[]): void {
  if (violations.length > 0) {
    const list = violations.map((v) => `  - ${v}`).join("\n");
    throw new Error(`Found ${violations.length} architecture violation(s):\n${list}`);
  }
  expect(violations).toEqual([]);
}

describe("monolith layering", () => {
  it("modules never import a sibling module", () => {
    const violations: string[] = [];

    for (const { file, ref } of allImports) {
      const ownModule = moduleNameOf(file);
      if (!ownModule) continue;

      const resolved = resolveSpecifier(file, ref.specifier);
      if (resolved.kind === "relative" && resolved.path) {
        const targetModule = moduleNameOf(resolved.path);
        if (targetModule && targetModule !== ownModule) {
          violations.push(
            formatViolation(file, ref, `module "${ownModule}" may not import sibling module "${targetModule}"`),
          );
        }
      }
    }

    reportAndAssert(violations);
  });

  it("entry/* never imports another entry/*", () => {
    const violations: string[] = [];

    for (const { file, ref } of allImports) {
      const rel = toRepoRelative(file);
      const match = rel.match(/^src\/entry\/([^/]+)\//);
      if (!match) continue;

      const resolved = resolveSpecifier(file, ref.specifier);
      if (resolved.kind === "relative" && resolved.path) {
        const targetRel = toRepoRelative(resolved.path);
        const targetMatch = targetRel.match(/^src\/entry\/([^/]+)\//);
        if (targetMatch && targetMatch[1] !== match[1]) {
          violations.push(
            formatViolation(file, ref, `entry/${match[1]} may not import entry/${targetMatch[1]}`),
          );
        }
      }
    }

    reportAndAssert(violations);
  });

  it("src/contracts never imports discord.js at runtime (types-only ok)", () => {
    const violations: string[] = [];

    for (const { file, ref } of allImports) {
      if (ownerOf(file).name !== "contracts") continue;

      const resolved = resolveSpecifier(file, ref.specifier);
      if (resolved.kind === "external" && resolved.pkg === "discord.js" && !ref.isTypeOnly) {
        violations.push(formatViolation(file, ref, "contracts may only take type-only imports from discord.js"));
      }
    }

    reportAndAssert(violations);
  });

  it("rpc/ and preconditions/ reach PermitResolver only through authorize()", () => {
    const violations: string[] = [];
    const RESTRICTED_ROOTS = [
      join(REPO_ROOT, "src/lib/rpc"),
      join(REPO_ROOT, "src/lib/permissions/preconditions"),
    ];
    const PERMIT_RESOLVER = join(REPO_ROOT, "src/lib/permissions/permit-resolver.ts");

    for (const { file, ref } of allImports) {
      if (!RESTRICTED_ROOTS.some((root) => file === root || file.startsWith(`${root}/`))) continue;

      const resolved = resolveSpecifier(file, ref.specifier);
      if (resolved.kind === "relative" && resolved.path === PERMIT_RESOLVER) {
        violations.push(
          formatViolation(file, ref, "authorization decisions go through authorize(), not PermitResolver directly"),
        );
      }
    }

    reportAndAssert(violations);
  });
});

describe("import-graph self-check", () => {
  it("scanned a non-trivial number of source files", () => {
    expect(allFiles.length).toBeGreaterThan(50);
  });
});
