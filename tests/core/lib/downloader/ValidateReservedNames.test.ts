import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateAddon } from "#src/lib/downloader/Validate.js";

describe("validateAddon - reserved lumi_ / __lumi_* prefixes", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lumi-validate-reserved-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  async function writeAddon(name: string, indexTs: string): Promise<string> {
    const addonDir = path.join(tmpDir, name);
    await fs.mkdir(addonDir, { recursive: true });
    await fs.writeFile(
      path.join(addonDir, "manifest.json"),
      JSON.stringify({
        name,
        displayName: name,
        emoji: "📦",
        description: "reserved prefix test",
        version: "1.0.0",
        author: ["Tester"],
        configFields: [],
        end_user_data_statement: "d",
      }),
    );
    await fs.writeFile(path.join(addonDir, "Index.ts"), indexTs);
    return addonDir;
  }

  it("warns without erroring when an addon declares lumi_ and __lumi_* members", async () => {
    const addonDir = await writeAddon(
      "reserved-addon",
      `import { defineModule } from "#src/lib/module-system/Module.js";\nexport const meta = defineModule({ name: "reserved-addon" });\nexport function lumi_cleanup() {}\nexport const __lumi_state = 1;\nexport const helper = { lumi_field: 1 };\n`,
    );

    const result = await validateAddon(addonDir);
    expect(result.errors).toEqual([]);
    const reserved = result.warnings.filter((w) => w.includes("reserved prefix"));
    expect(reserved.length).toBe(1);
    expect(reserved[0]).toContain("lumi_cleanup");
    expect(reserved[0]).toContain("__lumi_state");
  });

  it("passes normal names with no reserved-prefix warning", async () => {
    const addonDir = await writeAddon(
      "normal-addon",
      `import { defineModule } from "#src/lib/module-system/Module.js";\nexport const meta = defineModule({ name: "normal-addon" });\nexport function cleanup() {}\nexport const state = 1;\n`,
    );

    const result = await validateAddon(addonDir);
    expect(result.errors).toEqual([]);
    expect(result.warnings.filter((w) => w.includes("reserved prefix"))).toEqual([]);
  });
});
