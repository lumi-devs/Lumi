import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockExecFile } = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
}));

const { mockExistsSync, mockReadFile } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockReadFile: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: mockExecFile,
  default: { execFile: mockExecFile },
}));

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

interface MockEntry {
  stdout?: string;
  error?: Error;
}

/** Drives `execFile("git"|"bun", args, opts, cb)` from a `"file args..."` keyed map. */
function respondWith(map: Record<string, MockEntry>) {
  mockExecFile.mockImplementation(
    (file: string, args: string[], _opts: unknown, cb: (err: unknown, res?: unknown) => void) => {
      const key = `${file} ${args.join(" ")}`;
      const entry = map[key];
      if (!entry) {
        cb(new Error(`self-update.test.ts: no mock registered for "${key}"`));
        return;
      }
      if (entry.error) {
        cb(entry.error);
      } else {
        cb(null, { stdout: entry.stdout ?? "", stderr: "" });
      }
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
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
    expect(mockExecFile).not.toHaveBeenCalled();
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
      "git show origin/main:version.txt": { stdout: "1.2.3\n" },
    });

    const status = await getCoreUpdateStatus();

    expect(status.upToDate).toBe(false);
    expect(status.behindBy).toBe(3);
    expect(status.branch).toBe("main");
    expect(status.currentCommit).toBe("abc1234");
    expect(status.latestCommit).toBe("def5678");
    expect(status.currentVersion).toBe("1.2.0");
    expect(status.remoteVersion).toBe("1.2.3");
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

    expect(status).toEqual({
      upToDate: false,
      branch: "unknown",
      currentCommit: "unknown",
      behindBy: 0,
      error: "git not found",
    });
  });
});

describe("updateLumiCore", () => {
  it("returns the docker fallback error when there is no .git directory", async () => {
    mockExistsSync.mockReturnValue(false);

    const result = await updateLumiCore();

    expect(result.updated).toBe(false);
    expect(result.currentCommit).toBe("unknown");
    expect(result.error).toContain("Docker");
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it("does not pull or install when already up to date", async () => {
    mockExistsSync.mockReturnValue(true);
    respondWith({
      "git rev-parse --short HEAD": { stdout: "abc1234\n" },
      "git rev-parse --abbrev-ref HEAD": { stdout: "main\n" },
      "git fetch origin main": { stdout: "" },
      "git rev-parse --short origin/main": { stdout: "abc1234\n" },
    });

    const result = await updateLumiCore();

    expect(result).toEqual({ updated: false, currentCommit: "abc1234" });
    const calledFiles = mockExecFile.mock.calls.map((c) => c[0] as string);
    expect(calledFiles).not.toContain("bun");
    expect(
      mockExecFile.mock.calls.some(
        (c) => (c[1] as string[]).includes("pull"),
      ),
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

    const pullCall = mockExecFile.mock.calls.find(
      (c) => c[0] === "git" && (c[1] as string[]).includes("pull"),
    );
    expect(pullCall).toBeDefined();
    expect(pullCall?.[1]).toEqual(["pull", "--ff-only", "origin", "main"]);

    const installCall = mockExecFile.mock.calls.find((c) => c[0] === "bun");
    expect(installCall).toBeDefined();
    expect(installCall?.[1]).toEqual(["install", "--frozen-lockfile"]);
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
    const fallbackInstall = mockExecFile.mock.calls.find(
      (c) =>
        c[0] === "bun" &&
        (c[1] as string[]).length === 1 &&
        (c[1] as string[])[0] === "install",
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
    expect(result.error).toBe("not a fast-forward");
  });
});
