import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import git from "isomorphic-git";
import { materialize, resolveRevision } from "../src/git.ts";

const roots: string[] = [];

async function repo(): Promise<{ dir: string; oid: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), "lumi-git-"));
  roots.push(dir);
  await mkdir(path.join(dir, "addon"), { recursive: true });
  await writeFile(path.join(dir, "addon", "manifest.json"), '{"apiVersion":2}');
  await writeFile(path.join(dir, "addon", "index.ts"), "export default {};\n");
  await writeFile(path.join(dir, "README.md"), "root\n");
  await git.init({ fs, dir, defaultBranch: "main" });
  await git.add({ fs, dir, filepath: "." });
  const oid = await git.commit({
    fs,
    dir,
    message: "initial",
    author: { name: "Lumi", email: "lumi@example.invalid" },
  });
  return { dir, oid };
}

afterAll(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

describe("git materialization", () => {
  test("writes only the requested subtree", async () => {
    const { dir, oid } = await repo();
    const target = path.join(dir, "out");

    await materialize(dir, oid, target, "addon");

    expect(await readFile(path.join(target, "index.ts"), "utf8")).toBe("export default {};\n");
    expect(await readFile(path.join(target, "manifest.json"), "utf8")).toBe('{"apiVersion":2}');
    expect(fs.existsSync(path.join(target, "README.md"))).toBe(false);
  });

  test("resolves a short sha", async () => {
    const { dir, oid } = await repo();
    expect(await resolveRevision(dir, oid.slice(0, 8))).toBe(oid);
  });

  test("rejects revision injection", async () => {
    const { dir } = await repo();
    await expect(resolveRevision(dir, "--upload-pack=evil")).rejects.toThrow("Invalid git revision");
  });
});
