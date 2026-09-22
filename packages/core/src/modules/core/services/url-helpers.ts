/**
 * Derives a `DownloaderRepo.name` (the unique DB key, and the directory name
 * a repo is cloned into) from its git URL, so users don't have to invent one
 * by hand.
 *
 * Handles:
 *  - `https://github.com/owner/repo` / `https://github.com/owner/repo.git`
 *  - SSH shorthand: `git@github.com:owner/repo.git`
 *  - SSH URL form: `ssh://git@github.com/owner/repo.git`
 *  - the bare `owner/repo` shorthand
 *
 * The result always satisfies the repo name regex enforced in `resolver.ts`
 * (`/^[a-zA-Z0-9_][a-zA-Z0-9_-]*$/`): any leading `owner/` is dropped (only
 * the final path segment is kept), a trailing `.git` is stripped, and any
 * character the regex would reject is sanitized away. `name` stays a real,
 * editable field - this only supplies a sane default.
 */
export function deriveRepoNameFromUrl(url: string): string {
  const Fallback = "repo";
  if (!url) return Fallback;

  // Drop surrounding whitespace/angle-brackets and any query/hash noise,
  // then a trailing slash.
  let val = url.trim().replace(/^<|>$/g, "");
  val = (val.split(/[?#]/)[0] ?? "").replace(/\/+$/, "");
  if (!val) return Fallback;

  // Split on both "/" and ":" so the SSH shorthand ("git@host:owner/repo")
  // and HTTP(S)/SSH-URL forms ("https://host/owner/repo") all resolve the
  // same way - the final segment is the repo name, whatever came before it
  // (protocol, host, owner) is discarded.
  const segments = val.split(/[/:]+/).filter(Boolean);
  let name = segments[segments.length - 1] ?? "";

  // Strip a trailing ".git" suffix.
  name = name.replace(/\.git$/i, "");

  // Sanitize any character the `resolver.ts` name regex would reject, then
  // trim leading/trailing hyphens (the regex requires the first character to
  // be alphanumeric or an underscore - never a hyphen).
  name = name.replace(/[^a-zA-Z0-9_-]+/g, "-");
  name = name.replace(/^-+|-+$/g, "");

  return name.length > 0 ? name : Fallback;
}
