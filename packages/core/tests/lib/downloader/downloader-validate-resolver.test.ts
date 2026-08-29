import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import child_process from "node:child_process";
import { container } from "@sapphire/framework";
import { validateAddon, validateAddonOrRepo } from "#lib/downloader/validate.js";
import { DownloadResolver, MODULE_ROOT } from "#lib/downloader/resolver.js";
import { LumiInfo } from "#utilities/misc.js";

describe("Downloader & Addon Helpers (validate & resolver)", () => {
  let tmpDir: string;

  beforeEach(async () => {
    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;
    vi.spyOn(child_process, "execFile").mockImplementation((...args: any[]) => {
      const cb = args[args.length - 1];
      if (typeof cb === "function") {
        const error: any = new Error("Git clone failed");
        error.stderr = "Git clone failed";
        cb(error, "", "Git clone failed");
      }
      return {} as any;
    });
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lumi-downloader-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  describe("validateAddon - Manifest & Info Validation", () => {
    it("validates a fully compliant addon directory with zero errors", async () => {
      const addonName = "valid-addon";
      const addonDir = path.join(tmpDir, addonName);
      await fs.mkdir(addonDir, { recursive: true });

      const infoJson = {
        name: addonName,
        author: ["LumiTeam"],
        description: "Valid addon test",
        short: "Valid Addon",
        version: "1.0.0",
        min_bot_version: "1.0.0",
        end_user_data_statement: "Valid privacy statement",
      };
      await fs.writeFile(path.join(addonDir, "info.json"), JSON.stringify(infoJson));

      const manifestJson = {
        name: addonName,
        displayName: "Valid Addon",
        emoji: "📦",
        description: "Valid addon test",
        version: "1.0.0",
        targetService: "worker",
        subStores: [],
        configFields: [],
      };
      await fs.writeFile(path.join(addonDir, "manifest.json"), JSON.stringify(manifestJson));

      const indexTs = `
        import { Module } from "lumi";
        export function DefineModule(meta: any) { return (cls: any) => cls; }
        @DefineModule({ name: "${addonName}" })
        export class ValidModule extends Module {}
      `;
      await fs.writeFile(path.join(addonDir, "index.ts"), indexTs);

      const result = await validateAddon(addonDir);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it("detects missing info.json and index.ts", async () => {
      const emptyDir = path.join(tmpDir, "empty-addon");
      await fs.mkdir(emptyDir, { recursive: true });

      const result = await validateAddon(emptyDir);
      expect(result.errors).toContain("Missing info.json (Downloader metadata).");
      expect(result.errors).toContain("Missing index.ts (module entrypoint).");
    });

    it("checks semver compatibility and directory name matching in info.json", async () => {
      const addonDir = path.join(tmpDir, "my-addon");
      await fs.mkdir(addonDir, { recursive: true });

      // Name mismatch and min_bot_version higher than 1.0.0
      const infoJson = {
        name: "wrong-name",
        author: ["Tester"],
        description: "Mismatch addon",
        short: "Mismatch",
        version: "1.0.0",
        min_bot_version: "4.0.0",
        end_user_data_statement: "Mismatch addon privacy statement",
      };
      await fs.writeFile(path.join(addonDir, "info.json"), JSON.stringify(infoJson));
      await fs.writeFile(
        path.join(addonDir, "index.ts"),
        `@DefineModule({ name: "my-addon" })\nexport class TestModule {}`
      );

      const result = await validateAddon(addonDir);
      expect(result.errors).toContain('info.json "name" (wrong-name) must match the directory name (my-addon).');
      expect(result.errors).toContain(
        `info.json "min_bot_version" (4.0.0) exceeds current Lumi version (${LumiInfo.version}).`
      );
    });

    it("passes version compatibility for min_bot_version <= 1.0.0 (e.g. 0.9.0, 1.0.0, v1.0.0)", async () => {
      const addonDir = path.join(tmpDir, "version-addon");
      await fs.mkdir(addonDir, { recursive: true });

      const infoJson = {
        name: "version-addon",
        author: ["Tester"],
        description: "Version test",
        short: "Version",
        version: "1.0.0",
        min_bot_version: "0.9.5",
        end_user_data_statement: "Version addon privacy statement",
      };
      await fs.writeFile(path.join(addonDir, "info.json"), JSON.stringify(infoJson));
      await fs.writeFile(
        path.join(addonDir, "index.ts"),
        `@DefineModule({ name: "version-addon" })\nexport class TestModule {}`
      );

      const result = await validateAddon(addonDir);
      expect(result.errors).toEqual([]);
    });

    it("catches malformed JSON in info.json and manifest.json", async () => {
      const addonDir = path.join(tmpDir, "bad-json");
      await fs.mkdir(addonDir, { recursive: true });

      await fs.writeFile(path.join(addonDir, "info.json"), "{ invalid json ");
      await fs.writeFile(path.join(addonDir, "manifest.json"), "{ invalid manifest ");
      await fs.writeFile(
        path.join(addonDir, "index.ts"),
        `@DefineModule({ name: "bad-json" })\nexport class TestModule {}`
      );

      const result = await validateAddon(addonDir);
      expect(result.errors.some((e) => e.includes("info.json is not valid JSON"))).toBe(true);
      expect(result.errors.some((e) => e.includes("manifest.json is not valid JSON"))).toBe(true);
    });

    it("flags forbidden 'tasks/' directory and invalid code rules", async () => {
      const addonDir = path.join(tmpDir, "rule-addon");
      await fs.mkdir(addonDir, { recursive: true });
      await fs.mkdir(path.join(addonDir, "tasks"), { recursive: true });

      await fs.writeFile(
        path.join(addonDir, "info.json"),
        JSON.stringify({
          name: "rule-addon",
          author: ["Tester"],
          description: "Rule test",
          short: "Rule",
          version: "1.0.0",
        })
      );

      const indexTs = `
        import { EmbedBuilder } from "discord.js";
        import { other } from "#modules/afk/index.js";
        import { outside } from "../outside.js";
        @DefineModule({ name: "rule-addon" })
        export class RuleModule {
          run() {
            const embed = new EmbedBuilder();
            const db = container.prisma;
            stores.registerPath('/path');
          }
        }
      `;
      await fs.writeFile(path.join(addonDir, "index.ts"), indexTs);

      const result = await validateAddon(addonDir);
      expect(result.errors).toContain(
        'Found a "tasks/" directory - BullMQ pieces MUST live in "scheduled-tasks/" (a "tasks/" directory is silently never scanned).'
      );
      expect(result.errors.some((e) => e.includes("uses EmbedBuilder"))).toBe(true);
      expect(result.errors.some((e) => e.includes("touches container.prisma"))).toBe(true);
      expect(result.errors.some((e) => e.includes('imports another module via "#modules/afk/index.js"'))).toBe(true);
      expect(result.errors.some((e) => e.includes('relative import "../outside.js" escapes'))).toBe(true);
      expect(result.warnings.some((w) => w.includes("calls stores.registerPath"))).toBe(true);
    });
  });

  describe("validateAddonOrRepo", () => {
    it("validates a single addon root when info.json exists at root", async () => {
      const addonDir = path.join(tmpDir, "single-addon");
      await fs.mkdir(addonDir, { recursive: true });
      await fs.writeFile(
        path.join(addonDir, "info.json"),
        JSON.stringify({
          name: "single-addon",
          author: ["Tester"],
          description: "Single test",
          short: "Single",
          version: "1.0.0",
        })
      );
      await fs.writeFile(
        path.join(addonDir, "index.ts"),
        `@DefineModule({ name: "single-addon" })\nexport class SingleModule {}`
      );

      const map = await validateAddonOrRepo(addonDir);
      expect(map.size).toBe(1);
      expect(map.has("single-addon")).toBe(true);
    });

    it("scans multiple child addon directories when target is a repository folder", async () => {
      const repoDir = path.join(tmpDir, "multi-repo");
      const child1 = path.join(repoDir, "addon-one");
      const child2 = path.join(repoDir, "addon-two");
      await fs.mkdir(child1, { recursive: true });
      await fs.mkdir(child2, { recursive: true });

      await fs.writeFile(
        path.join(child1, "info.json"),
        JSON.stringify({ name: "addon-one", author: ["T"], description: "D1", short: "S1", version: "1.0.0" })
      );
      await fs.writeFile(
        path.join(child1, "index.ts"),
        `@DefineModule({ name: "addon-one" })\nexport class M1 {}`
      );

      await fs.writeFile(
        path.join(child2, "info.json"),
        JSON.stringify({ name: "addon-two", author: ["T"], description: "D2", short: "S2", version: "1.0.0" })
      );
      await fs.writeFile(
        path.join(child2, "index.ts"),
        `@DefineModule({ name: "addon-two" })\nexport class M2 {}`
      );

      const map = await validateAddonOrRepo(repoDir);
      expect(map.size).toBe(2);
      expect(map.has("addon-one")).toBe(true);
      expect(map.has("addon-two")).toBe(true);
    });
  });

  describe("DownloadResolver URL & Git Validations", () => {
    let resolver: DownloadResolver;

    beforeEach(() => {
      resolver = new DownloadResolver();
    });

    it("rejects invalid URL protocols and malformed strings in addRepo", async () => {
      await expect(resolver.addRepo("test_repo", "ftp://invalid-protocol.com")).rejects.toThrow(
        "Must be a valid HTTP/HTTPS URL or Git SSH URL"
      );

      await expect(resolver.addRepo("test_repo", "http://invalid-url:-1")).rejects.toThrow(
        "Invalid HTTP/HTTPS URL"
      );

      await expect(resolver.addRepo("test_repo", "not-a-url")).rejects.toThrow();
    });

    it("rejects file:// URLs in addRepo (local paths must never reach git clone)", async () => {
      await expect(
        resolver.addRepo("test_file", "file:///tmp/repo.git")
      ).rejects.toThrow("Must be a valid HTTP/HTTPS URL or Git SSH URL");
    });

    it("accepts valid http and SSH URLs (including markdown brackets)", async () => {
      await expect(
        resolver.addRepo("test_http", "<https://github.com/nonexistent/repo1.git>")
      ).rejects.toThrow("Git clone failed");

      await expect(
        resolver.addRepo("test_ssh", "git@github.com:owner/repo.git")
      ).rejects.toThrow("Git clone failed");
    }, 15000);
  });

  describe("DownloadResolver Module Querying & Installation", () => {
    let resolver: DownloadResolver;

    beforeEach(() => {
      resolver = new DownloadResolver();
    });

    it("throws error in getModulesInRepo if repo directory does not exist", async () => {
      await expect(resolver.getModulesInRepo("non-existent-repo")).rejects.toThrow(
        "has not been cloned locally"
      );
    });

    it("reads modules from modules.json in getModulesInRepo if present", async () => {
      const repoName = "repo-with-index";
      const repoPath = path.join(MODULE_ROOT, repoName);
      await fs.mkdir(repoPath, { recursive: true });

      try {
        const modulesData = [
          { name: "mod-a", version: "1.0.0", description: "Module A" },
          { name: "mod-b", version: "1.2.0", description: "Module B" },
        ];
        await fs.writeFile(
          path.join(repoPath, "modules.json"),
          JSON.stringify({ modules: modulesData })
        );

        const modules = await resolver.getModulesInRepo(repoName);
        expect(modules).toEqual(modulesData);
      } finally {
        await fs.rm(repoPath, { recursive: true, force: true }).catch(() => {});
      }
    });

    it("falls back to scanning info.json files if modules.json is absent", async () => {
      const repoName = "repo-scan";
      const repoPath = path.join(MODULE_ROOT, repoName);
      const mod1Dir = path.join(repoPath, "mod-1");
      await fs.mkdir(mod1Dir, { recursive: true });

      try {
        const info = { name: "mod-1", version: "2.0.0", description: "Scanned mod" };
        await fs.writeFile(path.join(mod1Dir, "info.json"), JSON.stringify(info));

        const modules = await resolver.getModulesInRepo(repoName);
        expect(modules.length).toBe(1);
        expect(modules[0]?.name).toBe("mod-1");
      } finally {
        await fs.rm(repoPath, { recursive: true, force: true }).catch(() => {});
      }
    });
  });
});
