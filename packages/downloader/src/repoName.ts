const MaxRepoNameLength = 64;

function sanitize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MaxRepoNameLength)
    .replace(/-+$/g, "");
}

export function repoNameFromUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return "";
  }

  const pathSegment = url.pathname
    .split("/")
    .filter(Boolean)
    .pop()
    ?.replace(/\.git$/i, "");
  const base = sanitize(pathSegment ?? "") || sanitize(url.hostname);
  if (!base) return "";
  return /^[a-z]/.test(base) ? base : sanitize(`repo-${base}`);
}
