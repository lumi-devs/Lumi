import { readdirSync, rmSync, existsSync, statSync, readFileSync } from "node:fs";
import path from "node:path";

function getDirSize(dir: string): number {
  if (!existsSync(dir)) return 0;
  let total = 0;
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      try {
        if (entry.isDirectory() && !entry.isSymbolicLink()) {
          total += getDirSize(fullPath);
        } else if (entry.isFile()) {
          total += statSync(fullPath).size;
        }
      } catch {}
    }
  } catch {}
  return total;
}

const rootDir = process.cwd();
const nm = path.join(rootDir, "node_modules");

if (!existsSync(nm)) {
  console.log("[prune] No node_modules found; skipping.");
  process.exit(0);
}

const beforeBytes = getDirSize(nm);

// 1. Read devDependencies from root package.json
const pkgPath = path.join(rootDir, "package.json");
const pkg = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, "utf8")) : {};
const devDeps = new Set(Object.keys(pkg.devDependencies || {}));

// Extra dev/test packages that are never needed in production runtime
const extraDevTools = [
  "@turbo",
  "turbo",
  "@prisma/studio-core",
  "@prisma/dev",
  "@electric-sql/pglite",
  "@electric-sql/pglite-socket",
  "@electric-sql/pglite-tools",
  "typescript",
  "@typescript",
  "eslint",
  "@eslint",
  "knip",
  "@changesets",
  "fast-check",
  "dts-bundle-generator",
];

for (const tool of extraDevTools) {
  devDeps.add(tool);
}

// The migrate service runs `bunx prisma migrate deploy` from this image,
// so the pinned CLI must survive pruning - otherwise bunx fetches latest.
devDeps.delete("prisma");

const bunStore = path.join(nm, ".bun");

for (const dep of devDeps) {
  const target = path.join(nm, dep);
  if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true });
  }

  if (existsSync(bunStore)) {
    const escaped = dep.replace("/", "+");
    try {
      for (const entry of readdirSync(bunStore)) {
        if (entry.startsWith(escaped + "@") || entry === escaped) {
          rmSync(path.join(bunStore, entry), { recursive: true, force: true });
        }
      }
    } catch {}
  }
}

// 2. Remove Debian-specific engines when running in Alpine / musl
function removeDebianEngines(dir: string) {
  if (!existsSync(dir)) return;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        removeDebianEngines(fullPath);
      } else if (entry.isFile() && entry.name.includes("debian")) {
        rmSync(fullPath, { force: true });
      }
    }
  } catch {}
}
removeDebianEngines(nm);

// 3. Remove .cache and global bun cache
const cacheDir = path.join(nm, ".cache");
if (existsSync(cacheDir)) {
  rmSync(cacheDir, { recursive: true, force: true });
}

const rootBun = path.join(process.env.HOME || "/root", ".bun");
if (existsSync(rootBun)) {
  rmSync(rootBun, { recursive: true, force: true });
}

// 4. Remove /tmp contents if writable
if (existsSync("/tmp")) {
  try {
    for (const file of readdirSync("/tmp")) {
      try {
        rmSync(path.join("/tmp", file), { recursive: true, force: true });
      } catch {}
    }
  } catch {}
}
// 5. Remove tests, spec files, and docs in packages and apps
function removeTestsAndDocs(dir: string) {
  if (!existsSync(dir)) return;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "tests" || entry.name === "__tests__" || entry.name === "coverage") {
          rmSync(fullPath, { recursive: true, force: true });
        } else {
          removeTestsAndDocs(fullPath);
        }
      } else if (entry.isFile()) {
        if (
          entry.name.endsWith(".test.ts") ||
          entry.name.endsWith(".spec.ts") ||
          entry.name.endsWith(".test.js") ||
          entry.name.endsWith(".spec.js") ||
          (entry.name.endsWith(".md") && !entry.name.includes("manifest"))
        ) {
          rmSync(fullPath, { force: true });
        }
      }
    }
  } catch {}
}

removeTestsAndDocs(path.join(rootDir, "packages"));
removeTestsAndDocs(path.join(rootDir, "apps"));

const afterBytes = getDirSize(nm);
const savedMb = Math.round((beforeBytes - afterBytes) / 1024 / 1024);
console.log(`[prune] Automatically cleaned node_modules: saved ~${savedMb} MB.`);
