import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  manifestFromMeta,
  metaFromManifest,
  readManifest,
  writeManifest,
  ManifestFile,
} from "#src/lib/module-system/Manifest.js";
import { cfg, FieldType } from "#src/lib/module-system/ConfigSchema.js";
import { CoreVersion } from "#src/lib/utilities/Version.js";

describe("Module Manifest Utilities", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lumi-manifest-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  describe("manifestFromMeta", () => {
    it("creates a manifest with explicit meta values", async () => {
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
          { key: "enabled", type: FieldType.Boolean, label: "Enabled", description: "Enable feature" },
        ],
      };

      const manifest = manifestFromMeta(meta);
      expect(manifest).toEqual({
        name: "test-module",
        displayName: "Test Module",
        emoji: "🚀",
        description: "A test module description",
        short: undefined,
        endUserDataStatement: undefined,
        version: "1.2.3",
        disableable: true,
        dependencies: ["dep-1"],
        conflicts: ["conflict-1"],
        configOverrides: true,
        configFields: meta.configFields,
        category: undefined,
        dashboardHref: undefined,
        author: undefined,
        requirements: undefined,
        install_msg: undefined,
        tags: undefined,
        hidden: undefined,
        disabled: undefined,
        min_bot_version: undefined,
        max_bot_version: undefined,
      });
    });

    it("derives configFields from configSchema when configFields is not provided", async () => {
      const meta = {
        name: "schema-module",
        configSchema: cfg.object({
          logChannel: cfg.channel({ label: "Log Channel", description: "Channel for logs" }),
        }),
      };

      const manifest = manifestFromMeta(meta);
      expect(manifest.configFields).toEqual([
        {
          key: "logChannel",
          type: FieldType.Channel,
          label: "Log Channel",
          description: "Channel for logs",
          default: undefined,
          required: undefined,
          channelTypes: undefined,
        },
      ]);
      expect(manifest.displayName).toBe("schema-module");
      expect(manifest.emoji).toBe("⚙️");
      expect(manifest.version).toBe(CoreVersion);
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
        configFields: [],
      };

      await writeManifest(tmpDir, manifest);
      const readBack = await readManifest(tmpDir);

      expect(readBack).toEqual(manifest);

      const raw = await fs.readFile(path.join(tmpDir, ManifestFile), "utf8");
      expect(raw.endsWith("\n")).toBe(true);
    });

    it("returns null when reading a non-existent or invalid manifest file", async () => {
      const missing = await readManifest(tmpDir);
      expect(missing).toBeNull();

      await fs.writeFile(path.join(tmpDir, ManifestFile), "invalid json {");
      const invalid = await readManifest(tmpDir);
      expect(invalid).toBeNull();
    });
  });
});
