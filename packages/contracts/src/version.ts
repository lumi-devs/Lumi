import pkg from "../package.json" with { type: "json" };

/**
 * The contracts package's own semver, re-exported as data so the dashboard
 * and `apps/api` — which now ship independently — can compare the wire
 * contract they were built against instead of assuming they match.
 *
 * Single source of truth: `packages/contracts/package.json`'s `version`.
 * Works both from source (bun resolves this JSON import directly) and from
 * the built `dist/` output (the published package always ships its own
 * `package.json` next to `dist/`, npm includes it regardless of `files`).
 */
export const CONTRACT_VERSION: string = pkg.version;
