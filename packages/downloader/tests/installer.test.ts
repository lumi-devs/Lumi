import { afterAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import git from "isomorphic-git";
import type { DownloaderModule, DownloaderRepo } from "@lumi/db";
import { createLogger } from "@lumi/foundation";
import type { RedisClient } from "@lumi/redis";
import { AddonInstaller, type InstallerStore } from "../src/index.ts";

const roots: string[] = [];
const logger = createLogger({ name: "test", level: "silent" });

interface MemoryStore extends InstallerStore {
  readonly repos: Map<string, DownloaderRepo>;
  readonly modules: Map<string, DownloaderModule>;
}

function memoryStore(): MemoryStore {
  const repos = new Map<string, DownloaderRepo>();
  const modules = new Map<string, DownloaderModule>();
  let nextRepoId = 1;

  return {
    repos,
    modules,
    async listRepos() {
      return [...repos.values()];
    },
    async getRepo(name) {
      return repos.get(name) ?? null;
    },
    async upsertRepo(repo) {
      const existing = repos.get(repo.name);
      const row: DownloaderRepo = {
        id: existing?.id ?? nextRepoId++,
        name: repo.name,
        url: repo.url,
        branch: repo.branch,
        commit: repo.commit,
        createdAt: existing?.createdAt ?? new Date(),
        updatedAt: new Date(),
      };
      repos.set(repo.name, row);
      return row;
    },
    async deleteRepo(name) {
      repos.delete(name);
    },
    async listInstalled() {
      return [...modules.values()];
    },
    async getInstalled(moduleName) {
      return modules.get(moduleName) ?? null;
    },
    async recordModule(record) {
      const repo = repos.get(record.repoName);
      if (!repo) throw new Error("missing repo");
      modules.set(record.moduleName, {
        repoId: repo.id,
        moduleName: record.moduleName,
        version: record.version,
        commit: record.commit,
        installedAt: new Date(),
      });
    },
    async deleteModule(moduleName) {
      modules.delete(moduleName);
    },
  };
}

function memoryRedis() {
  const values = new Map<string, string>();
  return {
    async set(key: string, value: string, ...args: unknown[]) {
      if (args.includes("NX") && values.has(key)) return null;
      values.set(key, value);
      return "OK";
    },
    async eval(script: string, _keys: number, key: string, token: string) {
      if (!script.includes("del")) return 1;
      if (values.get(key) === token) values.delete(key);
      return 1;
    },
  };
}

async function repo(root: string, version = "1.0.0"): Promise<string> {
  const dir = path.join(root, "data", "repos", "demo");
  await mkdir(path.join(dir, "addon"), { recursive: true });
  await writeFile(
    path.join(dir, "addon", "manifest.json"),
    JSON.stringify({
      apiVersion: 2,
      name: "addon",
      displayName: "Addon",
      emoji: "🧪",
      description: "test addon",
      version,
      entry: "./index.ts",
      dependencies: {},
      requirements: [],
      conflicts: [],
    }),
  );
  await writeFile(path.join(dir, "addon", "index.ts"), "export default { name: \"addon\" };\n");
  await git.init({ fs, dir, defaultBranch: "main" });
  await git.add({ fs, dir, filepath: "." });
  return git.commit({
    fs,
    dir,
    message: `v${version}`,
    author: { name: "Lumi", email: "lumi@example.invalid" },
  });
}

async function commitVersion(root: string, version: string): Promise<string> {
  const dir = path.join(root, "data", "repos", "demo");
  await writeFile(
    path.join(dir, "addon", "manifest.json"),
    JSON.stringify({
      apiVersion: 2,
      name: "addon",
      displayName: "Addon",
      emoji: "🧪",
      description: "test addon",
      version,
      entry: "./index.ts",
      dependencies: {},
      requirements: [],
      conflicts: [],
    }),
  );
  await git.add({ fs, dir, filepath: "." });
  return git.commit({
    fs,
    dir,
    message: `v${version}`,
    author: { name: "Lumi", email: "lumi@example.invalid" },
  });
}

afterAll(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

describe("AddonInstaller", () => {
  test("installs, updates, lists, and uninstalls an addon from a commit", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "lumi-installer-"));
    roots.push(root);
    const commit = await repo(root);
    const store = memoryStore();
    store.repos.set("demo", {
      id: 1,
      name: "demo",
      url: "https://example.invalid/demo.git",
      branch: "main",
      commit,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    let reloaded = 0;
    let unloaded = 0;
    const installer = new AddonInstaller({
      root,
      store,
      redis: memoryRedis() as unknown as RedisClient,
      logger,
      onInstalled: async () => {
        reloaded++;
      },
      onRemoved: async () => {
        unloaded++;
      },
    });

    const available = await installer.listAvailable("demo");
    expect(available.map((entry) => entry.name)).toEqual(["addon"]);

    const result = await installer.install("demo", "addon");
    expect(result.commit).toBe(commit);
    expect(result.previousVersion).toBeNull();
    expect(reloaded).toBe(1);

    const link = path.join(root, "data", "addons", "addon");
    const linkInfo = await stat(link);
    expect(linkInfo.isDirectory()).toBe(true);
    const installedManifest = JSON.parse(
      await readFile(path.join(link, "manifest.json"), "utf8"),
    ) as { version: string };
    expect(installedManifest.version).toBe("1.0.0");
    expect(store.modules.get("addon")?.commit).toBe(commit);

    const next = await commitVersion(root, "1.1.0");
    const updated = await installer.install("demo", "addon", next);
    expect(updated.commit).toBe(next);
    expect(updated.previousVersion).toBe(commit);
    expect(reloaded).toBe(2);
    expect(store.modules.get("addon")?.commit).toBe(next);
    expect((await readdir(path.join(installer.versionsRoot, "addon"))).sort()).toEqual([next]);
    const updatedManifest = JSON.parse(
      await readFile(path.join(link, "manifest.json"), "utf8"),
    ) as { version: string };
    expect(updatedManifest.version).toBe("1.1.0");

    await installer.uninstall("addon");
    expect(unloaded).toBe(1);
    expect(store.modules.size).toBe(0);
    expect(await stat(link).catch(() => null)).toBeNull();
  });
});
