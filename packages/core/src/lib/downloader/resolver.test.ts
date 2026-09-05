import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    // Real network/`bun add` isn't available in CI; installModule only needs
    // this call to resolve so the code after it (the regression under test)
    // runs. Every other resolver.ts codepath uses git via execFile too, but
    // this test never reaches those.
    execFile: (
      _cmd: string,
      _args: string[],
      _opts: unknown,
      callback: (err: null, result: { stdout: string; stderr: string }) => void,
    ) => callback(null, { stdout: "", stderr: "" }),
  };
});

const { resolver, ModuleRoot, AddonModulesRoot } = await import("./resolver.js");

const RepoName = "resolver-test-repo";
const ModuleName = "resolver-test-addon";

async function writeFixtureAddon() {
  const dir = path.join(ModuleRoot, RepoName, ModuleName);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "info.json"),
    JSON.stringify({
      name: ModuleName,
      author: ["Someone"],
      description: "Fixture addon for resolver tests.",
      short: "Fixture addon.",
      version: "1.0.0",
      requirements: ["some-package"],
      end_user_data_statement: "Resolver test privacy statement",
    }),
  );
  await fs.writeFile(
    path.join(dir, "index.ts"),
    `import { Module, DefineModule } from "lumi";\n\n@DefineModule({ name: "${ModuleName}" })\nexport class Fixture extends Module {}\n`,
  );
  return dir;
}

describe("DownloadResolver.installModule - requirements package boundary", () => {
  afterEach(async () => {
    await fs.rm(path.join(ModuleRoot, RepoName), { recursive: true, force: true });
    await fs.rm(path.join(AddonModulesRoot, ModuleName), { recursive: true, force: true });
  });

  it("symlinks node_modules/lumi into the addon's own directory when it declares requirements", async () => {
    const sourceDir = await writeFixtureAddon();

    await resolver.installModule(RepoName, ModuleName);

    // Regression: this synthetic package.json becomes the nearest package
    // boundary for the addon's own files, which - without the symlink -
    // silently breaks both "lumi" and the legacy #core/#lib/#utilities
    // aliases by shadowing root's package.json (see resolver.ts).
    const nodeModulesLumi = path.join(sourceDir, "node_modules", "lumi");
    const stat = await fs.lstat(nodeModulesLumi);
    expect(stat.isSymbolicLink()).toBe(true);

    const target = await fs.readlink(nodeModulesLumi);
    expect(path.resolve(path.dirname(nodeModulesLumi), target)).toBe(process.cwd());
  });
});
