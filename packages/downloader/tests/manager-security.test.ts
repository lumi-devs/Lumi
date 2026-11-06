import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AddonManager } from "../src/manager.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

function manager(root: string): AddonManager {
  return new AddonManager({
    prisma: {} as never,
    redis: {} as never,
    runtime: (() => ({})) as never,
    root,
  });
}

describe("AddonManager repository URLs", () => {
  it("rejects credentials embedded in repository URLs", async () => {
    const root = await mkdtemp(join(tmpdir(), "lumi-manager-"));
    roots.push(root);
    await expect(
      manager(root).addRepo("repo", "https://user:secret@example.com/repo.git"),
    ).rejects.toThrow("must not contain credentials");
  });

  it("rejects non-HTTPS repository URLs", async () => {
    const root = await mkdtemp(join(tmpdir(), "lumi-manager-"));
    roots.push(root);
    await expect(
      manager(root).addRepo("repo", "ssh://git@example.com/repo.git"),
    ).rejects.toThrow("must be HTTPS");
  });
});
