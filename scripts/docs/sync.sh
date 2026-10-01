#!/usr/bin/env bash
# Copies docs/site (MDX content + assets) and the generated JSON data into a
# lumi-devs/Lumi-docs checkout, mirroring noctalia-dev's tools/sync-docs.sh
# split between a main repo (source of truth for content) and a site repo
# (just the Next.js/fumadocs tooling).
#
# Usage: scripts/docs/sync.sh [site-root]
#   site-root defaults to ../Lumi-docs relative to this repo's root.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SITE_ROOT="${1:-"$REPO_ROOT/../Lumi-docs"}"
SITE_ROOT="$(cd "$SITE_ROOT" && pwd)"

if [ ! -d "$SITE_ROOT" ]; then
  echo "sync.sh: site root does not exist: $SITE_ROOT" >&2
  exit 1
fi

CONTENT_DST="$SITE_ROOT/content"
DATA_DST="$SITE_ROOT/data"
PUBLIC_DST="$SITE_ROOT/public/synced"

echo "==> Syncing docs/site content to $CONTENT_DST"
rm -rf "$CONTENT_DST.tmp"
mkdir -p "$CONTENT_DST.tmp"
cp -R "$REPO_ROOT/docs/site/content/." "$CONTENT_DST.tmp/"

if [ -z "$(find "$CONTENT_DST.tmp" -type f -print -quit)" ]; then
  echo "sync.sh: refusing to sync an empty content tree from docs/site/content" >&2
  rm -rf "$CONTENT_DST.tmp"
  exit 1
fi

rm -rf "$CONTENT_DST"
mv "$CONTENT_DST.tmp" "$CONTENT_DST"

if [ -d "$REPO_ROOT/docs/site/public" ]; then
  echo "==> Syncing docs/site public assets to $PUBLIC_DST"
  rm -rf "$PUBLIC_DST"
  mkdir -p "$PUBLIC_DST"
  cp -R "$REPO_ROOT/docs/site/public/." "$PUBLIC_DST/"
fi

echo "==> Running docs:export into $DATA_DST"
rm -rf "$DATA_DST"
(cd "$REPO_ROOT" && bun run docs:export -- --out "$DATA_DST")

if [ -z "$(find "$DATA_DST" -type f -print -quit)" ]; then
  echo "sync.sh: docs:export produced no files" >&2
  exit 1
fi

if git -C "$REPO_ROOT" rev-parse --git-dir >/dev/null 2>&1; then
  echo "==> Writing build-info.json"
  sha="$(git -C "$REPO_ROOT" rev-parse HEAD)"
  committed_at="$(git -C "$REPO_ROOT" show -s --format=%cI HEAD)"
  # Empty when the checkout is shallow or has no release tags yet; the site then omits the comparison.
  release="$(git -C "$REPO_ROOT" describe --tags --match 'v[0-9]*' --abbrev=0 2>/dev/null || true)"
  exact="false"
  if [ -n "$release" ] && [ "$(git -C "$REPO_ROOT" rev-list -n 1 "$release")" = "$sha" ]; then
    exact="true"
  fi
  printf '{"sha":"%s","committedAt":"%s","latestRelease":%s,"isRelease":%s}\n' \
    "$sha" "$committed_at" "$([ -n "$release" ] && printf '"%s"' "$release" || printf null)" "$exact" \
    >"$DATA_DST/build-info.json"
fi

echo "==> Sync complete: $SITE_ROOT"
