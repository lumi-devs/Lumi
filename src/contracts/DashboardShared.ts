import type { ConfigField } from "#src/contracts/Config.js";

const DefaultPickableChannelTypeIds = [0] as const;

export function resolveChannelTypeIds(field: ConfigField): readonly number[] {
  return field.channelTypes && field.channelTypes.length > 0
    ? field.channelTypes
    : DefaultPickableChannelTypeIds;
}

const SeparatorLine = /^\s*---\s*$/;

export function splitOnSeparator(text: string): string[] {
  const parts: string[] = [];
  for (const line of text.split("\n")) {
    if (SeparatorLine.test(line)) {
      parts.push("");
      continue;
    }
    const last = parts.length - 1;
    if (last < 0) parts.push(line);
    else parts[last] += (parts[last] ? "\n" : "") + line;
  }
  return parts;
}

const RepoNameFallback = "repo";

export function deriveRepoNameFromUrl(url: string): string {
  if (!url) return RepoNameFallback;

  let val = url.trim().replace(/^<|>$/g, "");
  val = (val.split(/[?#]/)[0] ?? "").replace(/\/+$/, "");
  if (!val) return RepoNameFallback;

  const segments = val.split(/[/:]+/).filter(Boolean);
  let name = segments[segments.length - 1] ?? "";

  name = name.replace(/\.git$/i, "");
  name = name.replace(/[^a-zA-Z0-9_-]+/g, "-");
  name = name.replace(/^-+|-+$/g, "");

  return name.length > 0 ? name : RepoNameFallback;
}
