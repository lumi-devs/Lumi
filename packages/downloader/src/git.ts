import { execFileSync } from "node:child_process";

const GitTimeoutMs = 180_000;
const MaxOutputBytes = 10 * 1024 * 1024;
const CommitRe = /^[0-9a-f]{4,64}$/i;

function gitEnv(url?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
  };
  const token = process.env.GIT_TOKEN;
  if (!token || !url) return env;

  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return env;
  }

  const username = process.env.GIT_USERNAME ?? "x-access-token";
  const header = Buffer.from(`${username}:${token}`).toString("base64");
  env.GIT_CONFIG_COUNT = "1";
  env.GIT_CONFIG_KEY_0 = `http.${origin}/.extraheader`;
  env.GIT_CONFIG_VALUE_0 = `Authorization: Basic ${header}`;
  return env;
}

function redact(value: string): string {
  return value
    .replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, "$1<redacted>@")
    .replace(/(authorization:\s*basic\s+)[a-z0-9+/=]+/gi, "$1<redacted>");
}

function gitError(error: unknown): string {
  if (error instanceof Error) {
    const stderr = (error as { stderr?: unknown }).stderr;
    if (typeof stderr === "string" && stderr.trim())
      return redact(stderr.trim());
    return redact(error.message);
  }
  return redact(String(error));
}

function run(args: string[], cwd?: string, authUrl?: string): string {
  try {
    return execFileSync("git", args, {
      ...(cwd ? { cwd } : {}),
      encoding: "utf8",
      timeout: GitTimeoutMs,
      maxBuffer: MaxOutputBytes,
      stdio: ["ignore", "pipe", "pipe"],
      env: gitEnv(authUrl),
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
  run(
    [
      "clone",
      "--quiet",
      "--depth",
      "1",
      "--single-branch",
      ...(branch ? ["--branch", branch] : []),
      "--",
      url,
      dir,
    ],
    undefined,
    url,
  );
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
    url,
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
    [
      "-c",
      "advice.detachedHead=false",
      "checkout",
      "--quiet",
      "--force",
      "--detach",
      commit,
    ],
    dir,
  );
}
