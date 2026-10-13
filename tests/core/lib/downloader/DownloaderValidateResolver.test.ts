import { describe, it, expect, beforeEach, afterEach, vi } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { container } from "#src/lib/Services.js";
import { validateAddon, validateAddonOrRepo } from "#src/lib/downloader/Validate.js";
import { DownloadResolver, ModuleRoot } from "#src/lib/downloader/Resolver.js";
import { LumiInfo } from "#src/lib/utilities/Version.js";
import { fakeSpawnResult } from "../../helpers/MockBunSpawn.js";

describe("Downloader & Addon Helpers (validate & resolver)", () => {
  let tmpDir: string;
  let resolver: DownloadResolver;

  beforeEach(async () => {
    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;
    vi.spyOn(Bun, "spawn").mockImplementation(
      () => fakeSpawnResult("", "Git clone failed", 1) as any,
    );
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lumi-downloader-test-"));
    resolver = new DownloadResolver();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  describe("validateAddon - Manifest & Info Validation", () => {
    it("validates a fully compliant addon directory with zero errors", async () => {
      const addonName = "valid-addon";
      const addonDir = path.join(tmpDir, addonName);
      await fs.mkdir(addonDir, { recursive: true });

      const manifestJson = {
        name: addonName,
        displayName: "Valid Addon",
        emoji: "📦",
        description: "Valid addon test",
        version: "1.0.0",
        author: ["LumiTeam"],
        min_bot_version: "0.1.0",
        end_user_data_statement: "Valid privacy statement",
        subStores: [],
        configFields: [],
      };
      await fs.writeFile(path.join(addonDir, "manifest.json"), JSON.stringify(manifestJson));

      const indexTs = `
        import { defineModule } from "@lumi-devs/lumi/module";
        export const meta = defineModule({ name: "${addonName}" });
      `;
      await fs.writeFile(path.join(addonDir, "Index.ts"), indexTs);

      const result = await validateAddon(addonDir);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it("rejects the removed decorator/class addon API", async () => {
      const addonDir = path.join(tmpDir, "legacy-addon");
      await fs.mkdir(addonDir, { recursive: true });

      await fs.writeFile(
        path.join(addonDir, "manifest.json"),
        JSON.stringify({
          name: "legacy-addon",
          displayName: "Legacy",
          emoji: "🧪",
          description: "Legacy addon",
          version: "1.0.0",
          author: ["Tester"],
          subStores: [],
          configFields: [],
          end_user_data_statement: "d",
        })
      );
      await fs.writeFile(
        path.join(addonDir, "Index.ts"),
        `import { defineModule } from "@lumi-devs/lumi/module";\n@DefineModule({ name: "legacy-addon" })\nexport class LegacyModule extends Module {}`
      );

      const result = await validateAddon(addonDir);
      expect(result.errors.some((e) => e.includes("removed class API"))).toBe(true);
    });

    it("detects missing manifest.json and index.ts", async () => {
      const emptyDir = path.join(tmpDir, "empty-addon");
      await fs.mkdir(emptyDir, { recursive: true });

      const result = await validateAddon(emptyDir);
      expect(result.errors).toContain("Missing manifest.json. An addon is discovered from its manifest - it carries the display metadata, target service, and dependency map without importing addon code.");
      expect(result.errors).toContain("Missing Index.ts (module entrypoint).");
    });

    it("checks semver compatibility and directory name matching in manifest.json", async () => {
      const addonDir = path.join(tmpDir, "my-addon");
      await fs.mkdir(addonDir, { recursive: true });

      const manifestJson = {
        name: "wrong-name",
        displayName: "Mismatch",
        emoji: "🧪",
        description: "Mismatch addon",
        version: "1.0.0",
        author: ["Tester"],
        min_bot_version: "4.0.0",
        end_user_data_statement: "Mismatch addon privacy statement",
        subStores: [],
        configFields: [],
      };
      await fs.writeFile(path.join(addonDir, "manifest.json"), JSON.stringify(manifestJson));
      await fs.writeFile(
        path.join(addonDir, "Index.ts"),
        `import { defineModule } from "@lumi-devs/lumi/module";\nexport const meta = defineModule({ name: "my-addon" });`
      );

      const result = await validateAddon(addonDir);
      expect(result.errors).toContain('manifest.json "name" (wrong-name) must match the directory name (my-addon).');
      expect(result.errors).toContain(
        `manifest.json "min_bot_version" (4.0.0) exceeds current Lumi version (${LumiInfo.version}).`
      );
    });

    it("passes version compatibility for a min_bot_version at or below the current version", async () => {
      const addonDir = path.join(tmpDir, "version-addon");
      await fs.mkdir(addonDir, { recursive: true });

      const manifestJson = {
        name: "version-addon",
        displayName: "Version",
        emoji: "📦",
        description: "Version test",
        version: "1.0.0",
        author: ["Tester"],
        min_bot_version: "0.2.0",
        end_user_data_statement: "Version addon privacy statement",
        subStores: [],
        configFields: [],
      };
      await fs.writeFile(path.join(addonDir, "manifest.json"), JSON.stringify(manifestJson));
      await fs.writeFile(
        path.join(addonDir, "Index.ts"),
        `import { defineModule } from "@lumi-devs/lumi/module";\nexport const meta = defineModule({ name: "version-addon" });`
      );

      const result = await validateAddon(addonDir);
      expect(result.errors).toEqual([]);
    });

    it("catches malformed JSON in manifest.json", async () => {
      const addonDir = path.join(tmpDir, "bad-json");
      await fs.mkdir(addonDir, { recursive: true });

      await fs.writeFile(path.join(addonDir, "manifest.json"), "{ invalid manifest ");
      await fs.writeFile(
        path.join(addonDir, "Index.ts"),
        `import { defineModule } from "@lumi-devs/lumi/module";\nexport const meta = defineModule({ name: "bad-json" });`
      );

      const result = await validateAddon(addonDir);
      expect(result.errors.some((e) => e.includes("manifest.json is not valid JSON"))).toBe(true);
    });

    it("allows a 'tasks/' directory and flags invalid code rules", async () => {
      const addonDir = path.join(tmpDir, "rule-addon");
      await fs.mkdir(addonDir, { recursive: true });
      await fs.mkdir(path.join(addonDir, "tasks"), { recursive: true });

      await fs.writeFile(
        path.join(addonDir, "manifest.json"),
        JSON.stringify({
          name: "rule-addon",
          displayName: "Rule",
          emoji: "🧪",
          description: "Rule test",
          version: "1.0.0",
          author: ["Tester"],
          subStores: [],
          configFields: [],
          end_user_data_statement: "d",
        })
      );

      const indexTs = `
        import { defineModule } from "@lumi-devs/lumi/module";
        import { EmbedBuilder } from "discord.js";
        import { other } from "@lumi-devs/lumi/modules/afk/Index.js";
        import { outside } from "../outside.js";
        export const meta = defineModule({ name: "rule-addon" });
        export function run() {
          const embed = new EmbedBuilder();
          const db = container.prisma;
          stores.registerPath('/path');
        }
      `;
      await fs.writeFile(path.join(addonDir, "Index.ts"), indexTs);

      const result = await validateAddon(addonDir);
      expect(result.errors.some((e) => e.includes("tasks/"))).toBe(false);
      expect(result.errors.some((e) => e.includes("uses EmbedBuilder"))).toBe(true);
      expect(result.errors.some((e) => e.includes("the `services` argument"))).toBe(true);
      expect(result.errors.some((e) => e.includes('imports another module via "@lumi-devs/lumi/modules/afk/Index.js"'))).toBe(true);
      expect(result.errors.some((e) => e.includes('relative import "../outside.js" escapes'))).toBe(true);
      expect(result.warnings.some((w) => w.includes("calls stores.registerPath"))).toBe(true);
    });
  });

  describe("validateAddonOrRepo", () => {
    it("validates a single addon root when manifest.json exists at root", async () => {
      const addonDir = path.join(tmpDir, "single-addon");
      await fs.mkdir(addonDir, { recursive: true });
      await fs.writeFile(
        path.join(addonDir, "manifest.json"),
        JSON.stringify({
          name: "single-addon",
          displayName: "Single",
          emoji: "🧪",
          description: "Single test",
          version: "1.0.0",
          author: ["Tester"],
          subStores: [],
          configFields: [],
          end_user_data_statement: "d",
        })
      );
      await fs.writeFile(
        path.join(addonDir, "Index.ts"),
        `import { defineModule } from "@lumi-devs/lumi/module";\nexport const meta = defineModule({ name: "single-addon" });`
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
        path.join(child1, "manifest.json"),
        JSON.stringify({ name: "addon-one", displayName: "One", emoji: "🧪", description: "D1", version: "1.0.0", author: ["T"], subStores: [], configFields: [], end_user_data_statement: "d" })
      );
      await fs.writeFile(
        path.join(child1, "Index.ts"),
        `import { defineModule } from "@lumi-devs/lumi/module";\nexport const meta = defineModule({ name: "addon-one" });`
      );

      await fs.writeFile(
        path.join(child2, "manifest.json"),
        JSON.stringify({ name: "addon-two", displayName: "Two", emoji: "🧪", description: "D2", version: "1.0.0", author: ["T"], subStores: [], configFields: [], end_user_data_statement: "d" })
      );
      await fs.writeFile(
        path.join(child2, "Index.ts"),
        `import { defineModule } from "@lumi-devs/lumi/module";\nexport const meta = defineModule({ name: "addon-two" });`
      );

      const map = await validateAddonOrRepo(repoDir);
      expect(map.size).toBe(2);
      expect(map.has("addon-one")).toBe(true);
      expect(map.has("addon-two")).toBe(true);
    });
  });

  describe("DownloadResolver URL & Git Validations", () => {
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
    it("throws error in getModulesInRepo if repo directory does not exist", async () => {
      await expect(resolver.getModulesInRepo("non-existent-repo")).rejects.toThrow(
        "has not been cloned locally"
      );
    });

    it("reads modules from modules.json in getModulesInRepo if present", async () => {
      const repoName = "repo-with-index";
      const repoPath = path.join(ModuleRoot, repoName);
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
        expect(modules).toEqual<typeof modulesData>(modulesData);
      } finally {
        await fs.rm(repoPath, { recursive: true, force: true }).catch(() => {});
      }
    });

    it("falls back to scanning manifest.json files if modules.json is absent", async () => {
      const repoName = "repo-scan";
      const repoPath = path.join(ModuleRoot, repoName);
      const mod1Dir = path.join(repoPath, "mod-1");
      await fs.mkdir(mod1Dir, { recursive: true });

      try {
        const info = { name: "mod-1", version: "2.0.0", description: "Scanned mod" };
        await fs.writeFile(path.join(mod1Dir, "manifest.json"), JSON.stringify(info));

        const modules = await resolver.getModulesInRepo(repoName);
        expect(modules.length).toBe(1);
        expect(modules[0]?.name).toBe("mod-1");
      } finally {
        await fs.rm(repoPath, { recursive: true, force: true }).catch(() => {});
      }
    });
  });
});
