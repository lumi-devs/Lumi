import fs from "node:fs";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";

const GitTimeoutMs = 180_000;
const CommitRe = /^[0-9a-f]{4,64}$/i;

const gitHttp = {
  async request(request: Parameters<typeof http.request>[0]) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GitTimeoutMs);
    try {
      return await http.request({ ...request, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  },
};

function redact(value: string): string {
  return value
    .replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, "$1<redacted>@")
    .replace(/(authorization:\s*basic\s+)[a-z0-9+/=]+/gi, "$1<redacted>");
}

function errorMessage(error: unknown): string {
  return redact(error instanceof Error ? error.message : String(error));
}

export function createGitAuth(repoUrl: string) {
  const token = process.env.GIT_TOKEN;
  if (!token) return undefined;
  let origin: string;
  try {
    origin = new URL(repoUrl).origin;
  } catch {
    return undefined;
  }
  return (url: string) => {
    let requestedOrigin: string;
    try {
      requestedOrigin = new URL(url).origin;
    } catch {
      return undefined;
    }
    if (requestedOrigin !== origin) return undefined;
    return {
      username: process.env.GIT_USERNAME ?? "x-access-token",
      password: token,
    };
  };
}

export async function clone(
  url: string,
  dir: string,
  branch: string | null,
): Promise<void> {
  try {
    await git.clone({
      fs,
      http: gitHttp,
      dir,
      url,
      ...(branch ? { ref: branch } : {}),
      singleBranch: true,
      depth: 1,
      noTags: true,
      onAuth: createGitAuth(url),
    });
  } catch (error) {
    throw new Error(`git clone failed: ${errorMessage(error)}`);
  }
}

export async function fetch(
  url: string,
  dir: string,
  branch: string | null,
): Promise<string | null> {
  try {
    const result = await git.fetch({
      fs,
      http: gitHttp,
      dir,
      url,
      ...(branch ? { ref: branch } : {}),
      singleBranch: true,
      depth: 1,
      tags: false,
      onAuth: createGitAuth(url),
    });
    return result.fetchHead ?? null;
  } catch (error) {
    throw new Error(`git fetch failed: ${errorMessage(error)}`);
  }
}

export async function head(dir: string): Promise<string | null> {
  try {
    return await git.resolveRef({ fs, dir, ref: "HEAD" });
  } catch {
    return null;
  }
}

export async function checkout(dir: string, commit: string): Promise<void> {
  if (!CommitRe.test(commit)) {
    throw new Error(`Invalid git commit "${commit}".`);
  }
  try {
    await git.checkout({ fs, dir, ref: commit, force: true });
  } catch (error) {
    throw new Error(`git checkout failed: ${errorMessage(error)}`);
  }
}
