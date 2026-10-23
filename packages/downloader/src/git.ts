import { mkdir, writeFile } from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";

export class GitError extends Error {
  public constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "GitError";
    this.cause = cause;
  }
}

function auth(): { username: string; password: string } | undefined {
  const token = process.env["GIT_TOKEN"];
  if (!token) return undefined;
  return { username: process.env["GIT_USERNAME"] ?? "x-access-token", password: token };
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function clone(url: string, dir: string, branch = "default"): Promise<string> {
  try {
    await git.clone({
      fs,
      http,
      dir,
      url,
      ...(branch === "default" ? {} : { ref: branch, singleBranch: true }),
      onAuth: auth,
    });
  } catch (error) {
    throw new GitError(`Clone failed: ${describe(error)}`, error);
  }
  return head(dir);
}

export async function fetch(dir: string, branch = "default"): Promise<string | null> {
  try {
    const result = await git.fetch({
      fs,
      http,
      dir,
      remote: "origin",
      ...(branch === "default" ? {} : { ref: branch }),
      onAuth: auth,
    });
    return (await resolveRemote(dir, branch)) ?? result.fetchHead ?? null;
  } catch (error) {
    throw new GitError(`Fetch failed: ${describe(error)}`, error);
  }
}

export async function head(dir: string): Promise<string> {
  try {
    return await git.resolveRef({ fs, dir, ref: "HEAD" });
  } catch (error) {
    throw new GitError(`Could not resolve HEAD: ${describe(error)}`, error);
  }
}

export async function resolveRemote(dir: string, branch = "default"): Promise<string | null> {
  const candidates =
    branch === "default"
      ? ["refs/remotes/origin/HEAD", "FETCH_HEAD"]
      : [`refs/remotes/origin/${branch}`, "FETCH_HEAD"];

  for (const ref of candidates) {
    try {
      return await git.resolveRef({ fs, dir, ref });
    } catch {
      continue;
    }
  }
  return null;
}

export async function resolveRevision(dir: string, revision: string): Promise<string> {
  if (!/^[A-Za-z0-9._/@{}^~-]+$/.test(revision) || revision.startsWith("-")) {
    throw new Error(`Invalid git revision: ${revision}`);
  }
  try {
    return await git.resolveRef({ fs, dir, ref: revision });
  } catch {
    try {
      return await git.expandOid({ fs, dir, oid: revision });
    } catch (error) {
      throw new GitError(`Could not resolve revision '${revision}': ${describe(error)}`, error);
    }
  }
}

export async function checkout(dir: string, oid: string): Promise<void> {
  try {
    await git.checkout({ fs, dir, ref: oid, force: true });
  } catch (error) {
    throw new GitError(`Checkout failed: ${describe(error)}`, error);
  }
}

interface TreeEntry {
  path: string;
  oid: string;
  type: "blob" | "tree" | "commit";
  mode: string;
}

async function readTree(dir: string, oid: string): Promise<TreeEntry[]> {
  const { tree } = await git.readTree({ fs, dir, oid });
  return tree as TreeEntry[];
}

async function writeTree(
  dir: string,
  treeOid: string,
  target: string,
  prefix: string,
  relative = "",
): Promise<void> {
  for (const entry of await readTree(dir, treeOid)) {
    const entryPath = relative ? `${relative}/${entry.path}` : entry.path;
    if (prefix && entryPath !== prefix && !entryPath.startsWith(`${prefix}/`)) continue;
    if (entry.type === "tree") {
      await writeTree(dir, entry.oid, target, prefix, entryPath);
      continue;
    }
    if (entry.type !== "blob" || entry.mode === "120000") continue;
    const stripped = prefix ? entryPath.slice(prefix.length).replace(/^\//, "") : entryPath;
    const destination = path.join(target, stripped);
    if (!destination.startsWith(target + path.sep)) continue;
    const { blob } = await git.readBlob({ fs, dir, oid: entry.oid });
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, blob);
  }
}

export async function materialize(dir: string, oid: string, target: string, prefix = ""): Promise<void> {
  const commit = await git.readCommit({ fs, dir, oid });
  await mkdir(target, { recursive: true });
  await writeTree(dir, commit.commit.tree, target, prefix);
}
