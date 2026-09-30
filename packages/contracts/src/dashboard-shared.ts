import type { ConfigField } from "./config.js";

/**
 * Text channel (`ChannelType.GuildText` = `0`) as a numeric literal, not a
 * discord.js import — this file is shared with the dashboard (via the
 * published `@lumi-devs/contracts` package), which doesn't depend on
 * discord.js at all, and the value never changes without a breaking Discord
 * API change.
 */
const DefaultPickableChannelTypeIds = [0] as const;

/**
 * The channel type ids a Channel-typed config field accepts: the field's own
 * `channelTypes` when set, else text channels only. Shared by the panel's
 * native picker (`packages/core`) and the dashboard's picker so both offer
 * the exact same set of channels for a given field.
 */
export function resolveChannelTypeIds(field: ConfigField): readonly number[] {
  return field.channelTypes && field.channelTypes.length > 0
    ? field.channelTypes
    : DefaultPickableChannelTypeIds;
}

const SeparatorLine = /^\s*---\s*$/;

/**
 * Splits `text` on a lone `---` line into separate parts, with an empty
 * string marking each split point. Used to lay out a drawn divider between
 * text components — shared by the worker's actual render
 * (`packages/core/src/lib/message-content.ts`) and the dashboard's preview.
 */
export function splitOnSeparator(text: string): string[] {
  return text.split("\n").reduce<string[]>((parts, line) => {
    if (SeparatorLine.test(line)) {
      parts.push("");
      return parts;
    }
    if (parts.length === 0) parts.push(line);
    else parts[parts.length - 1] += (parts[parts.length - 1] ? "\n" : "") + line;
    return parts;
  }, []);
}

const RepoNameFallback = "repo";

/**
 * Derives a `DownloaderRepo.name` from its git URL, so users don't have to
 * invent one by hand - e.g. `https://github.com/owner/repo(.git)` -> `repo`.
 * Handles HTTPS, SSH shorthand (`git@host:owner/repo.git`), SSH URLs, and
 * the bare `owner/repo` shorthand.
 *
 * The result always satisfies the repo name regex enforced server-side in
 * the downloader module's `resolver.ts` (`/^[a-zA-Z0-9_][a-zA-Z0-9_-]*$/`).
 * Shared by the worker (server-side default) and the dashboard (client-side
 * preview while typing) so the two never drift.
 */
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
