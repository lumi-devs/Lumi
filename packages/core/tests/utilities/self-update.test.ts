import { describe, it, expect, vi, beforeEach } from "bun:test";
import { fakeSpawnResult } from "../helpers/mock-bun-spawn.js";

// bun:test's `vi.mock` isn't hoisted above imports the way vitest's is, so
// these just need to be declared before the `vi.mock` calls below — no
// `vi.hoisted` wrapper required.
const mockExistsSync = vi.fn();
const mockReadFile = vi.fn();

vi.mock("node:fs", () => ({
  existsSync: mockExistsSync,
  promises: { readFile: mockReadFile },
  default: {
    existsSync: mockExistsSync,
    promises: { readFile: mockReadFile },
  },
}));

vi.mock("@sapphire/framework", () => ({
  container: { logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } },
}));

import {
  getCoreUpdateStatus,
  updateLumiCore,
} from "#lib/utilities/self-update.js";
import { LumiInfo } from "#utilities/misc.js";

interface MockEntry {
  stdout?: string;
  error?: Error;
}

let spawnSpy: ReturnType<typeof vi.spyOn<typeof Bun, "spawn">> & {
  mockImplementation: (fn: (cmd: string[]) => unknown) => void;
};

/** Drives Bun.spawn(["git"|"bun", ...args], opts) from a `"file args..."` keyed map. */
function respondWith(map: Record<string, MockEntry>) {
  spawnSpy.mockImplementation((cmd: string[]) => {
    const key = cmd.join(" ");
    const entry = map[key];
    if (!entry) return fakeSpawnResult("", `no mock registered for "${key}"`, 1) as any;
    if (entry.error) return fakeSpawnResult("", entry.error.message, 1) as any;
    return fakeSpawnResult(entry.stdout ?? "") as any;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  spawnSpy = vi.spyOn(Bun, "spawn") as typeof spawnSpy;
  mockReadFile.mockRejectedValue(new Error("ENOENT"));
});

describe("getCoreUpdateStatus", () => {
  it("returns the docker fallback status when there is no .git directory", async () => {
    mockExistsSync.mockReturnValue(false);

    const status = await getCoreUpdateStatus();

    expect(status).toEqual({
      upToDate: true,
      branch: "docker",
      currentCommit: "docker-build",
      behindBy: 0,
      error: "Running via Docker. Cannot check git status.",
    });
    expect(spawnSpy).not.toHaveBeenCalled();
  });

  it("computes behindBy and version fields from git output", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue("1.2.0\n");
    respondWith({
      "git rev-parse --short HEAD": { stdout: "abc1234\n" },
      "git rev-parse --abbrev-ref HEAD": { stdout: "main\n" },
      "git fetch origin main": { stdout: "" },
      "git rev-parse --short origin/main": { stdout: "def5678\n" },
      "git rev-list --count abc1234..origin/main": { stdout: "3\n" },
      "git show origin/main:packages/core/package.json": {
        stdout: JSON.stringify({ version: "3.3.0" }),
      },
    });

    const status = await getCoreUpdateStatus();

    expect(status.upToDate).toBe(false);
    expect(status.behindBy).toBe(3);
    expect(status.branch).toBe("main");
    expect(status.currentCommit).toBe("abc1234");
    expect(status.latestCommit).toBe("def5678");
    expect(status.currentVersion).toBe(LumiInfo.version);
    expect(status.remoteVersion).toBe("3.3.0");
    expect(status.error).toBeUndefined();
  });

  it("reports upToDate when behindBy is 0", async () => {
    mockExistsSync.mockReturnValue(true);
    respondWith({
      "git rev-parse --short HEAD": { stdout: "abc1234\n" },
      "git rev-parse --abbrev-ref HEAD": { stdout: "main\n" },
      "git fetch origin main": { stdout: "" },
      "git rev-parse --short origin/main": { stdout: "abc1234\n" },
      "git rev-list --count abc1234..origin/main": { stdout: "0\n" },
      "git show origin/main:version.txt": { stdout: "1.2.0\n" },
    });

    const status = await getCoreUpdateStatus();

    expect(status.upToDate).toBe(true);
    expect(status.behindBy).toBe(0);
  });

  it("falls back to the error branch when a git call throws", async () => {
    mockExistsSync.mockReturnValue(true);
    respondWith({
      "git rev-parse --short HEAD": { error: new Error("git not found") },
    });

    const status = await getCoreUpdateStatus();

    expect(status).toMatchObject({
      upToDate: false,
      branch: "unknown",
      currentCommit: "unknown",
      behindBy: 0,
    });
    expect(status.error).toContain("git not found");
  });
});

describe("updateLumiCore", () => {
  it("returns the docker fallback error when there is no .git directory", async () => {
    mockExistsSync.mockReturnValue(false);

    const result = await updateLumiCore();

    expect(result.updated).toBe(false);
    expect(result.currentCommit).toBe("unknown");
    expect(result.error).toContain("Docker");
    expect(spawnSpy).not.toHaveBeenCalled();
  });

  it("does not pull or install when already up to date", async () => {
    mockExistsSync.mockReturnValue(true);
    respondWith({
      "git rev-parse --short HEAD": { stdout: "abc1234\n" },
      "git rev-parse --abbrev-ref HEAD": { stdout: "main\n" },
      "git fetch origin main": { stdout: "" },
      "git rev-parse --short origin/main": { stdout: "abc1234\n" },
      "git rev-list --count abc1234..origin/main": { stdout: "0\n" },
    });

    const result = await updateLumiCore();

    expect(result).toEqual({ updated: false, currentCommit: "abc1234" });
    const calledFiles = spawnSpy.mock.calls.map((c) => (c[0] as string[])[0]);
    expect(calledFiles).not.toContain("bun");
    expect(
      spawnSpy.mock.calls.some((c) => (c[0] as string[]).includes("pull")),
    ).toBe(false);
  });

  it("pulls updates and runs bun install when behind", async () => {
    mockExistsSync.mockReturnValue(true);
    respondWith({
      "git rev-parse --short HEAD": { stdout: "abc1234\n" },
      "git rev-parse --abbrev-ref HEAD": { stdout: "main\n" },
      "git fetch origin main": { stdout: "" },
      "git rev-parse --short origin/main": { stdout: "def5678\n" },
      "git log --oneline -n 5 abc1234..origin/main": {
        stdout: "def5678 fix bug",
      },
      "git rev-list --count abc1234..origin/main": { stdout: "2\n" },
      "git pull --ff-only origin main": { stdout: "" },
      "bun install --frozen-lockfile": { stdout: "" },
    });

    const result = await updateLumiCore();

    expect(result).toEqual({
      updated: true,
      currentCommit: "abc1234",
      latestCommit: "def5678",
      commitsCount: 2,
      changelog: "def5678 fix bug",
    });

    const pullCall = spawnSpy.mock.calls.find(
      (c) => (c[0] as string[])[0] === "git" && (c[0] as string[]).includes("pull"),
    );
    expect(pullCall).toBeDefined();
    expect((pullCall?.[0] as string[]).slice(1)).toEqual(["pull", "--ff-only", "origin", "main"]);

    const installCall = spawnSpy.mock.calls.find((c) => (c[0] as string[])[0] === "bun");
    expect(installCall).toBeDefined();
    expect((installCall?.[0] as string[]).slice(1)).toEqual(["install", "--frozen-lockfile"]);
  });

  it("falls back to plain bun install when --frozen-lockfile fails", async () => {
    mockExistsSync.mockReturnValue(true);
    respondWith({
      "git rev-parse --short HEAD": { stdout: "abc1234\n" },
      "git rev-parse --abbrev-ref HEAD": { stdout: "main\n" },
      "git fetch origin main": { stdout: "" },
      "git rev-parse --short origin/main": { stdout: "def5678\n" },
      "git log --oneline -n 5 abc1234..origin/main": {
        stdout: "def5678 fix bug",
      },
      "git rev-list --count abc1234..origin/main": { stdout: "1\n" },
      "git pull --ff-only origin main": { stdout: "" },
      "bun install --frozen-lockfile": { error: new Error("lockfile drift") },
      "bun install": { stdout: "" },
    });

    const result = await updateLumiCore();

    expect(result.updated).toBe(true);
    const fallbackInstall = spawnSpy.mock.calls.find(
      (c) => (c[0] as string[]).length === 2 && (c[0] as string[])[1] === "install",
    );
    expect(fallbackInstall).toBeDefined();
  });

  it("returns an error result when the pull fails", async () => {
    mockExistsSync.mockReturnValue(true);
    respondWith({
      "git rev-parse --short HEAD": { stdout: "abc1234\n" },
      "git rev-parse --abbrev-ref HEAD": { stdout: "main\n" },
      "git fetch origin main": { stdout: "" },
      "git rev-parse --short origin/main": { stdout: "def5678\n" },
      "git log --oneline -n 5 abc1234..origin/main": {
        stdout: "def5678 fix bug",
      },
      "git rev-list --count abc1234..origin/main": { stdout: "1\n" },
      "git pull --ff-only origin main": {
        error: new Error("not a fast-forward"),
      },
    });

    const result = await updateLumiCore();

    expect(result.updated).toBe(false);
    expect(result.currentCommit).toBe("unknown");
    expect(result.error).toContain("not a fast-forward");
  });
});
