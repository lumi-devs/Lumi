import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs, existsSync } from "node:fs";
import { join } from "node:path";
import { container } from "@sapphire/framework";
import { LumiInfo } from "#utilities/misc.js";

const execFileAsync = promisify(execFile);
const execGit = (args: string[]) =>
  execFileAsync("git", args, {
    timeout: 45_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });

export interface CoreUpdateResult {
  updated: boolean;
  currentCommit: string;
  latestCommit?: string;
  commitsCount?: number;
  changelog?: string;
  error?: string;
}

export interface CoreUpdateStatus {
  upToDate: boolean;
  branch: string;
  currentCommit: string;
  latestCommit?: string;
  behindBy: number;
  currentVersion?: string;
  remoteVersion?: string;
  error?: string;
}

interface GitSnapshot {
  branch: string;
  currentCommit: string;
  latestCommit: string;
  behindBy: number;
}

const PackageFile = "packages/core/package.json";

async function readPackageVersion(ref?: string): Promise<string | undefined> {
  try {
    const output = ref
      ? await execGit(["show", `${ref}:${PackageFile}`])
      : await fs.readFile(PackageFile, "utf8");
    const raw = typeof output === "string" ? output : output.stdout;
    const parsed = JSON.parse(raw) as { version?: string };
    return typeof parsed.version === "string" && parsed.version.length > 0
      ? parsed.version
      : undefined;
  } catch {
    return undefined;
  }
}

/** Resolves branch, current commit, remote commit, and behindBy count in one fetch round-trip. */
async function resolveGitSnapshot(): Promise<GitSnapshot> {
  const [currentHashOut, branchOut] = await Promise.all([
    execGit(["rev-parse", "--short", "HEAD"]),
    execGit(["rev-parse", "--abbrev-ref", "HEAD"]),
  ]);
  const currentCommit = currentHashOut.stdout.trim();
  const branch = branchOut.stdout.trim() || "main";

  await execGit(["fetch", "origin", branch]);

  const [remoteHashOut, countOut] = await Promise.all([
    execGit(["rev-parse", "--short", `origin/${branch}`]),
    execGit(["rev-list", "--count", `${currentCommit}..origin/${branch}`]),
  ]);
  const latestCommit = remoteHashOut.stdout.trim();
  const behindBy = parseInt(countOut.stdout.trim(), 10) || 0;

  return { branch, currentCommit, latestCommit, behindBy };
}

/**
 * Checks local and remote core status without mutating the current checkout.
 */
export async function getCoreUpdateStatus(): Promise<CoreUpdateStatus> {
  const cwd = process.cwd();
  if (!existsSync(join(cwd, ".git"))) {
    return {
      upToDate: true,
      branch: "docker",
      currentCommit: "docker-build",
      behindBy: 0,
      error: "Running via Docker. Cannot check git status.",
    };
  }

  try {
    const { branch, currentCommit, latestCommit, behindBy } =
      await resolveGitSnapshot();

    const currentVersion = LumiInfo.version;
    const remoteVersion = await readPackageVersion(`origin/${branch}`);

    return {
      upToDate: behindBy === 0,
      branch,
      currentCommit,
      latestCommit,
      behindBy,
      currentVersion,
      remoteVersion,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      upToDate: false,
      branch: "unknown",
      currentCommit: "unknown",
      behindBy: 0,
      error: msg,
    };
  }
}

/**
 * Checks for and applies git self-updates to Lumi core.
 */
export async function updateLumiCore(): Promise<CoreUpdateResult> {
  const cwd = process.cwd();

  if (!existsSync(join(cwd, ".git"))) {
    return {
      updated: false,
      currentCommit: "unknown",
      error:
        "Lumi is running via Docker or without a `.git` repository. Please update by pulling the latest image (e.g., `docker pull ghcr.io/lumi-devs/lumi:latest`).",
    };
  }

  try {
    const { branch, currentCommit, latestCommit, behindBy } =
      await resolveGitSnapshot();

    container.logger?.info(
      `[SelfUpdate] Checking remote updates for Lumi core (${branch} @ ${currentCommit})...`,
    );

    if (behindBy === 0) {
      return { updated: false, currentCommit };
    }

    const logOut = await execGit([
      "log",
      "--oneline",
      "-n",
      "5",
      `${currentCommit}..origin/${branch}`,
    ]);
    const changelog = logOut.stdout.trim();

    container.logger?.info(
      `[SelfUpdate] Pulling ${behindBy} commit(s) from origin/${branch}...`,
    );
    await execGit(["pull", "--ff-only", "origin", branch]);

    try {
      await execFileAsync("bun", ["install", "--frozen-lockfile"], {
        cwd,
        timeout: 60_000,
      });
    } catch {
      await execFileAsync("bun", ["install"], { cwd, timeout: 60_000 }).catch(
        () => {},
      );
    }

    container.logger?.info(
      `[SelfUpdate] Successfully updated Lumi core to ${latestCommit}!`,
    );

    return {
      updated: true,
      currentCommit,
      latestCommit,
      commitsCount: behindBy,
      changelog,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    container.logger?.error(`[SelfUpdate] Failed to update Lumi core:`, err);
    return { updated: false, currentCommit: "unknown", error: msg };
  }
}
