import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import { container } from "@sapphire/framework";

const execFileAsync = promisify(execFile);
const execGit = (args: string[]) =>
  execFileAsync("git", args, {
    timeout: 45000,
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

const VERSION_FILE = "version.txt";

async function readLocalVersionFile(): Promise<string | undefined> {
  try {
    const content = await fs.readFile(VERSION_FILE, "utf8");
    const value = content.trim();
    return value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

async function readRemoteVersionFile(
  branch: string,
): Promise<string | undefined> {
  try {
    const output = await execGit(["show", `origin/${branch}:${VERSION_FILE}`]);
    const value = output.stdout.trim();
    return value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Checks local and remote core status without mutating the current checkout.
 */
export async function getCoreUpdateStatus(): Promise<CoreUpdateStatus> {
  try {
    const currentHashOutput = await execGit(["rev-parse", "--short", "HEAD"]);
    const currentCommit = currentHashOutput.stdout.trim();

    const branchOutput = await execGit(["rev-parse", "--abbrev-ref", "HEAD"]);
    const branch = branchOutput.stdout.trim() || "master";

    await execGit(["fetch", "origin", branch]);

    const remoteHashOutput = await execGit([
      "rev-parse",
      "--short",
      `origin/${branch}`,
    ]);
    const latestCommit = remoteHashOutput.stdout.trim();

    const countOutput = await execGit([
      "rev-list",
      "--count",
      `${currentCommit}..origin/${branch}`,
    ]);
    const behindBy = parseInt(countOutput.stdout.trim(), 10) || 0;

    const [currentVersion, remoteVersion] = await Promise.all([
      readLocalVersionFile(),
      readRemoteVersionFile(branch),
    ]);

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
  try {
    // 1. Get current commit hash
    const currentHashOutput = await execGit(["rev-parse", "--short", "HEAD"]);
    const currentCommit = currentHashOutput.stdout.trim();

    // 2. Get current branch name
    const branchOutput = await execGit(["rev-parse", "--abbrev-ref", "HEAD"]);
    const branch = branchOutput.stdout.trim() || "master";

    container.logger?.info(
      `[SelfUpdate] Checking remote updates for Lumi core (${branch} @ ${currentCommit})...`,
    );

    // 3. Fetch remote changes
    await execGit(["fetch", "origin", branch]);

    // 4. Get remote HEAD hash
    const remoteHashOutput = await execGit([
      "rev-parse",
      "--short",
      `origin/${branch}`,
    ]);
    const latestCommit = remoteHashOutput.stdout.trim();

    if (currentCommit === latestCommit) {
      return {
        updated: false,
        currentCommit,
      };
    }

    // 5. Calculate commits count & log
    const logOutput = await execGit([
      "log",
      "--oneline",
      "-n",
      "5",
      `${currentCommit}..origin/${branch}`,
    ]);
    const changelog = logOutput.stdout.trim();
    const countOutput = await execGit([
      "rev-list",
      "--count",
      `${currentCommit}..origin/${branch}`,
    ]);
    const commitsCount = parseInt(countOutput.stdout.trim(), 10) || 1;

    // 6. Pull remote updates
    container.logger?.info(
      `[SelfUpdate] Pulling ${commitsCount} commit(s) from origin/${branch}...`,
    );
    await execGit(["pull", "--ff-only", "origin", branch]);

    // 7. Try bun install if package.json / bun.lockb changed
    try {
      await execFileAsync("bun", ["install", "--frozen-lockfile"], {
        cwd,
        timeout: 60000,
      });
    } catch {
      await execFileAsync("bun", ["install"], { cwd, timeout: 60000 }).catch(
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
      commitsCount,
      changelog,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    container.logger?.error(`[SelfUpdate] Failed to update Lumi core:`, err);
    return {
      updated: false,
      currentCommit: "unknown",
      error: msg,
    };
  }
}
