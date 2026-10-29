import { execFileSync } from "node:child_process";

const GitTimeoutMs = 180_000;
const MaxOutputBytes = 10 * 1024 * 1024;
const CommitRe = /^[0-9a-f]{4,64}$/i;

function gitEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
  };
  const token = process.env.GIT_TOKEN;
  if (!token) return env;

  const username = process.env.GIT_USERNAME ?? "x-access-token";
  const header = Buffer.from(`${username}:${token}`).toString("base64");
  env.GIT_CONFIG_COUNT = "1";
  env.GIT_CONFIG_KEY_0 = "http.extraheader";
  env.GIT_CONFIG_VALUE_0 = `Authorization: Basic ${header}`;
  return env;
}

function gitError(error: unknown): string {
  if (error instanceof Error) {
    const stderr = (error as { stderr?: unknown }).stderr;
    if (typeof stderr === "string" && stderr.trim()) return stderr.trim();
    return error.message;
  }
  return String(error);
}

function run(args: string[], cwd?: string): string {
  try {
    return execFileSync("git", args, {
      ...(cwd ? { cwd } : {}),
      encoding: "utf8",
      timeout: GitTimeoutMs,
      maxBuffer: MaxOutputBytes,
      stdio: ["ignore", "pipe", "pipe"],
      env: gitEnv(),
    }).trim();
  } catch (error) {
    throw new Error(`git ${args[0] ?? "command"} failed: ${gitError(error)}`);
  }
}

export async function clone(
  url: string,
  dir: string,
  branch: string | null,
): Promise<void> {
  run([
    "clone",
    "--quiet",
    "--depth",
    "1",
    "--single-branch",
    ...(branch ? ["--branch", branch] : []),
    "--",
    url,
    dir,
  ]);
}

export async function fetch(
  url: string,
  dir: string,
  branch: string | null,
): Promise<string | null> {
  run(
    [
      "fetch",
      "--quiet",
      "--depth",
      "1",
      "--no-tags",
      "--",
      url,
      ...(branch ? [branch] : []),
    ],
    dir,
  );
  try {
    return run(["rev-parse", "--verify", "FETCH_HEAD"], dir);
  } catch {
    return null;
  }
}

export async function head(dir: string): Promise<string | null> {
  try {
    return run(["rev-parse", "--verify", "HEAD"], dir);
  } catch {
    return null;
  }
}

export async function checkout(dir: string, commit: string): Promise<void> {
  if (!CommitRe.test(commit)) {
    throw new Error(`Invalid git commit "${commit}".`);
  }
  run(
    ["-c", "advice.detachedHead=false", "checkout", "--quiet", "--force", "--detach", commit],
    dir,
  );
}
