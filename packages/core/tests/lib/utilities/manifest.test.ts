import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  detectSubStores,
  manifestFromMeta,
  metaFromManifest,
  readManifest,
  writeManifest,
  MANIFEST_FILE,
} from "#lib/module-system/manifest.js";
import { cfg, FieldType } from "#lib/module-system/config-schema.js";

describe("Module Manifest Utilities", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lumi-manifest-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  describe("detectSubStores", () => {
    it("detects existing sub-store directories inside a module directory", async () => {
      await fs.mkdir(path.join(tmpDir, "commands"), { recursive: true });
      await fs.mkdir(path.join(tmpDir, "listeners"), { recursive: true });
      // Create a file instead of directory for "scheduled-tasks" to ensure only directories are counted
      await fs.writeFile(path.join(tmpDir, "scheduled-tasks"), "not a directory");

      const detected = await detectSubStores(tmpDir);
      expect(detected).toContain("commands");
      expect(detected).toContain("listeners");
      expect(detected).not.toContain("scheduled-tasks");
    });
  });

  describe("manifestFromMeta", () => {
    it("creates a manifest with explicit meta values and detects sub-stores", async () => {
      await fs.mkdir(path.join(tmpDir, "commands"), { recursive: true });

      const meta = {
        name: "test-module",
        displayName: "Test Module",
        emoji: "🚀",
        description: "A test module description",
        version: "1.2.3",
        isCore: false,
        disableable: true,
        dependencies: ["dep-1"],
        conflicts: ["conflict-1"],
        configOverrides: true,
        configFields: [
          { key: "enabled", type: FieldType.BOOLEAN, label: "Enabled", description: "Enable feature" },
        ],
      };

      const manifest = await manifestFromMeta(meta, tmpDir);
      expect(manifest).toEqual({
        name: "test-module",
        displayName: "Test Module",
        emoji: "🚀",
        description: "A test module description",
        version: "1.2.3",
        disableable: true,
        dependencies: ["dep-1"],
        conflicts: ["conflict-1"],
        configOverrides: true,
        targetService: "worker",
        subStores: ["commands"],
        configFields: meta.configFields,
      });
    });

    it("derives configFields from configSchema when configFields is not provided", async () => {
      const meta = {
        name: "schema-module",
        configSchema: cfg.object({
          logChannel: cfg.channel({ label: "Log Channel", description: "Channel for logs" }),
        }),
      };

      const manifest = await manifestFromMeta(meta, tmpDir);
      expect(manifest.configFields).toEqual([
        {
          key: "logChannel",
          type: "CHANNEL",
          label: "Log Channel",
          description: "Channel for logs",
          default: undefined,
          required: undefined,
          channelTypes: undefined,
        },
      ]);
      expect(manifest.displayName).toBe("schema-module");
      expect(manifest.emoji).toBe("⚙️");
      expect(manifest.version).toBe("0.0.0");
      expect(manifest.disableable).toBe(true);
    });
  });

  describe("metaFromManifest", () => {
    it("converts a ModuleManifest into runtime ModuleMeta", () => {
      const manifest = {
        name: "runtime-mod",
        displayName: "Runtime Mod",
        emoji: "✨",
        description: "Desc",
        version: "2.0.0",
        disableable: false,
        dependencies: ["base"],
        conflicts: [],
        configOverrides: false,
        targetService: "worker" as const,
        subStores: ["commands"],
        configFields: [],
      };

      const meta = metaFromManifest(manifest);
      expect(meta).toEqual({
        name: "runtime-mod",
        displayName: "Runtime Mod",
        emoji: "✨",
        description: "Desc",
        version: "2.0.0",
        disableable: false,
        dependencies: ["base"],
        conflicts: [],
        configOverrides: false,
        configFields: [],
      });
    });
  });

  describe("readManifest & writeManifest", () => {
    it("writes manifest to file and reads it back correctly", async () => {
      const manifest = {
        name: "io-module",
        displayName: "IO Module",
        emoji: "💾",
        description: "File IO test",
        version: "1.0.0",
        disableable: true,
        dependencies: [],
        conflicts: [],
        configOverrides: false,
        targetService: "worker" as const,
        subStores: [],
        configFields: [],
      };

      await writeManifest(tmpDir, manifest);
      const readBack = await readManifest(tmpDir);

      expect(readBack).toEqual(manifest);

      // Verify file content format
      const raw = await fs.readFile(path.join(tmpDir, MANIFEST_FILE), "utf8");
      expect(raw.endsWith("\n")).toBe(true);
    });

    it("returns null when reading a non-existent or invalid manifest file", async () => {
      const missing = await readManifest(tmpDir);
      expect(missing).toBeNull();

      await fs.writeFile(path.join(tmpDir, MANIFEST_FILE), "invalid json {");
      const invalid = await readManifest(tmpDir);
      expect(invalid).toBeNull();
    });
  });
});
