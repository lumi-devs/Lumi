import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import {
  REPO_ROOT,
  isSdkFile,
  listSourceFiles,
  moduleNameOf,
  ownerOf,
  parseImports,
  resolveSpecifier,
  toRepoRelative,
  type ImportRef,
} from "./import-graph.js";

interface FileImport {
  file: string;
  ref: ImportRef;
}

const PACKAGE_SOURCE_DIRS = ["packages/contracts/src", "packages/core/src", "packages/observability/src"];
const APP_SOURCE_DIRS = ["apps/api/src", "apps/scheduler/src", "apps/worker/src", "apps/cli/src"];

const allFiles = [...PACKAGE_SOURCE_DIRS, ...APP_SOURCE_DIRS].flatMap((dir) => listSourceFiles(dir));

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

describe("package dependency direction", () => {
  it("packages/contracts and packages/observability import nothing from packages/core or apps/*", () => {
    const violations: string[] = [];

    for (const { file, ref } of allImports) {
      const owner = ownerOf(file);
      if (owner.type !== "package") continue;
      if (owner.name !== "contracts" && owner.name !== "observability") continue;

      const resolved = resolveSpecifier(file, ref.specifier);

      if (resolved.kind === "workspace" && resolved.pkg === "core") {
        violations.push(formatViolation(file, ref, `${owner.name} may not import @lumi/core`));
        continue;
      }

      if ((resolved.kind === "relative" || resolved.kind === "alias") && resolved.path) {
        const targetOwner = ownerOf(resolved.path);
        if (targetOwner.type === "package" && targetOwner.name === "core") {
          violations.push(formatViolation(file, ref, `${owner.name} may not import packages/core`));
        }
        if (targetOwner.type === "app") {
          violations.push(formatViolation(file, ref, `${owner.name} may not import apps/${targetOwner.name}`));
        }
      }
    }

    reportAndAssert(violations);
  });

  it("packages/* never import apps/*", () => {
    const violations: string[] = [];

    for (const { file, ref } of allImports) {
      const owner = ownerOf(file);
      if (owner.type !== "package") continue;

      const resolved = resolveSpecifier(file, ref.specifier);
      if ((resolved.kind === "relative" || resolved.kind === "alias") && resolved.path) {
        const targetOwner = ownerOf(resolved.path);
        if (targetOwner.type === "app") {
          violations.push(
            formatViolation(file, ref, `packages/${owner.name} may not import apps/${targetOwner.name}`),
          );
        }
      }
    }

    reportAndAssert(violations);
  });

  it("apps/* never import another apps/*", () => {
    const violations: string[] = [];

    for (const { file, ref } of allImports) {
      const owner = ownerOf(file);
      if (owner.type !== "app") continue;

      const resolved = resolveSpecifier(file, ref.specifier);
      if ((resolved.kind === "relative" || resolved.kind === "alias") && resolved.path) {
        const targetOwner = ownerOf(resolved.path);
        if (targetOwner.type === "app" && targetOwner.name !== owner.name) {
          violations.push(
            formatViolation(file, ref, `apps/${owner.name} may not import apps/${targetOwner.name}`),
          );
        }
      }
    }

    reportAndAssert(violations);
  });

  it("modules never import a sibling module (relative-path bypass check; ESLint's no-restricted-imports already covers the specifier-pattern case)", () => {
    const violations: string[] = [];

    for (const { file, ref } of allImports) {
      const ownModule = moduleNameOf(file);
      if (!ownModule) continue;

      const resolved = resolveSpecifier(file, ref.specifier);
      if ((resolved.kind === "relative" || resolved.kind === "alias") && resolved.path) {
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

  it("the addon SDK only imports what its public contract allows", () => {
    const violations: string[] = [];
    // Presentational/formatting-only surfaces the SDK re-exports as `lumi/ui`
    // and `lumi/utils`. Everything else under #lib/ (database, client, rpc,
    // permissions, valkey, ...) stays off-limits — the SDK reaches the host
    // only through rpc.ts's call().
    const ALLOWED_LIB_PREFIXES = ["#lib/ui/", "#lib/module-system/", "#lib/utilities/", "#lib/branding/"];
    const ALLOWED_EXTERNAL = new Set(["@discordjs/builders"]);

    for (const { file, ref } of allImports) {
      if (!isSdkFile(file)) continue;

      const resolved = resolveSpecifier(file, ref.specifier);

      switch (resolved.kind) {
        case "builtin":
          continue;
        case "relative": {
          if (resolved.path && isSdkFile(resolved.path)) continue;
          violations.push(formatViolation(file, ref, "SDK files may only import siblings within the SDK folder"));
          continue;
        }
        case "alias": {
          if (ALLOWED_LIB_PREFIXES.some((prefix) => ref.specifier.startsWith(prefix))) continue;
          violations.push(
            formatViolation(
              file,
              ref,
              "SDK may only reach into #lib/ui/* or #lib/module-system/*, never other #lib/* or #modules/*",
            ),
          );
          continue;
        }
        case "workspace": {
          if (resolved.pkg === "contracts" && ref.isTypeOnly) continue;
          violations.push(
            formatViolation(file, ref, "SDK may only take type-only imports from @lumi/contracts, never @lumi/core"),
          );
          continue;
        }
        case "external": {
          if (ALLOWED_EXTERNAL.has(resolved.pkg ?? "")) continue;
          violations.push(
            formatViolation(file, ref, "SDK must talk to the host via rpc.ts's call(), not a third-party runtime"),
          );
          continue;
        }
        case "unresolved":
        default:
          violations.push(formatViolation(file, ref, "could not classify this SDK import"));
      }
    }

    reportAndAssert(violations);
  });

  it("apps/api never imports command/listener/interaction-handler files directly", () => {
    const violations: string[] = [];
    const restrictedRoot = join(REPO_ROOT, "packages/core/src/modules");
    const restrictedSubdirs = ["commands", "listeners", "interaction-handlers"];

    for (const { file, ref } of allImports) {
      const owner = ownerOf(file);
      if (owner.type !== "app" || owner.name !== "api") continue;

      const resolved = resolveSpecifier(file, ref.specifier);
      if ((resolved.kind === "relative" || resolved.kind === "alias") && resolved.path?.startsWith(`${restrictedRoot}/`)) {
        const rest = resolved.path.slice(restrictedRoot.length + 1).split("/");
        const subdir = rest[1];
        if (subdir && restrictedSubdirs.includes(subdir)) {
          violations.push(
            formatViolation(file, ref, "apps/api must go through the RPC layer, not a module's command/listener/interaction-handler files"),
          );
        }
      }
    }

    reportAndAssert(violations);
  });

  it("packages/contracts never imports discord.js at runtime beyond peerDependencies (types-only ok)", () => {
    const violations: string[] = [];

    for (const { file, ref } of allImports) {
      const owner = ownerOf(file);
      if (owner.type !== "package" || owner.name !== "contracts") continue;

      const resolved = resolveSpecifier(file, ref.specifier);
      if (resolved.kind === "external" && resolved.pkg === "discord.js" && !ref.isTypeOnly) {
        violations.push(formatViolation(file, ref, "contracts may only take type-only imports from discord.js"));
      }
    }

    reportAndAssert(violations);
  });

  it("rpc/, preconditions/ and the addon sandbox reach PermitResolver only through authorize()", () => {
    const violations: string[] = [];
    const RESTRICTED_ROOTS = [
      join(REPO_ROOT, "packages/core/src/lib/rpc"),
      join(REPO_ROOT, "packages/core/src/lib/permissions/preconditions"),
      join(REPO_ROOT, "packages/core/src/lib/addon-sandbox"),
    ];
    const PERMIT_RESOLVER = join(REPO_ROOT, "packages/core/src/lib/permissions/PermitResolver.ts");

    for (const { file, ref } of allImports) {
      if (!RESTRICTED_ROOTS.some((root) => file === root || file.startsWith(`${root}/`))) continue;

      const resolved = resolveSpecifier(file, ref.specifier);
      if ((resolved.kind === "relative" || resolved.kind === "alias") && resolved.path === PERMIT_RESOLVER) {
        violations.push(
          formatViolation(file, ref, "authorization decisions go through authorize() (#lib/permissions/authorize.js), not PermitResolver directly"),
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
