import fs from "node:fs";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";

function auth() {
  const token = process.env.GIT_TOKEN;
  if (!token) return undefined;
  return {
    username: process.env.GIT_USERNAME ?? "x-access-token",
    password: token,
  };
}

function options() {
  const credentials = auth();
  return credentials ? { onAuth: () => credentials } : {};
}

export async function clone(url: string, dir: string, branch: string | null): Promise<void> {
  await git.clone({
    fs,
    http,
    dir,
    url,
    ref: branch ?? undefined,
    singleBranch: true,
    depth: 1,
    ...options(),
  });
}

export async function fetch(url: string, dir: string, branch: string | null): Promise<string | null> {
  const result = await git.fetch({
    fs,
    http,
    dir,
    url,
    ref: branch ?? undefined,
    singleBranch: true,
    depth: 1,
    ...options(),
  });
  return result.fetchHead;
}

export async function head(dir: string): Promise<string | null> {
  try {
    return await git.resolveRef({ fs, dir, ref: "HEAD" });
  } catch {
    return null;
  }
}

export async function checkout(dir: string, commit: string): Promise<void> {
  await git.checkout({ fs, dir, ref: commit, force: true });
}
