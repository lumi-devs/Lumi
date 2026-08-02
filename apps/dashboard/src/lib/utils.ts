import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge conditional class names, resolving Tailwind class conflicts (shadcn-style `cn()` helper). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Derives a `DownloaderRepo.name` from its git URL, so users don't have to
 * invent one by hand - e.g. `https://github.com/owner/repo(.git)` -> `repo`.
 *
 * Client-side duplicate of `deriveRepoNameFromUrl` in
 * `packages/core/src/lib/downloader/url-helpers.ts` (server-only reachable
 * code - the dashboard app doesn't depend on `@lumi/core`). Keep the two in
 * sync if either changes; this is a few lines of pure string logic, not
 * worth sharing a module across the server/client boundary for.
 *
 * The result always satisfies the repo name regex enforced server-side in
 * `resolver.ts` (`/^[a-zA-Z0-9_][a-zA-Z0-9_-]*$/`).
 */
export function deriveRepoNameFromUrl(url: string): string {
  const FALLBACK = "repo";
  if (!url) return FALLBACK;

  let val = url.trim().replace(/^<|>$/g, "");
  val = (val.split(/[?#]/)[0] ?? "").replace(/\/+$/, "");
  if (!val) return FALLBACK;

  const segments = val.split(/[/:]+/).filter(Boolean);
  let name = segments[segments.length - 1] ?? "";

  name = name.replace(/\.git$/i, "");
  name = name.replace(/[^a-zA-Z0-9_-]/g, "-");
  name = name.replace(/^-+/, "").replace(/-+$/, "");

  return name.length > 0 ? name : FALLBACK;
}
