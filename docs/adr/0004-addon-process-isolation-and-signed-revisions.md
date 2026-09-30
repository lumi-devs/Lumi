# 0004: Addon process isolation, pinned revisions and SSH commit signing

Status: Accepted

## Context

Third-party addons are arbitrary code, downloaded from a git repo
(`packages/core/src/lib/downloader/`) and symlinked into
`packages/core/src/modules/`. Running that in-process with the bot token, DB
URL and Redis URL makes every addon a full compromise; updating by pulling
whatever a branch currently points to means a compromised upstream reaches
every self-hoster who updates.

## Decision

Three independent controls:

- **Process isolation**: each addon runs as its own child process
  (`packages/core/src/lib/addon-sandbox/AddonHost.ts`), inheriting only an
  env allowlist — `PATH`, `HOME`, `TZ`, `LANG`, `LC_ALL`, `NODE_ENV` — not a
  denylist, "so a denylist doesn't silently leak whatever secret is added to
  `.env` next." It reaches the host only through the `lumi` SDK's RPC channel
  (`sdk/rpc.ts`), never a direct `#lib`/`#modules` import (checked by the
  import-graph test).
- **Pinned revisions**: `DownloadResolver`
  (`packages/core/src/lib/downloader/resolver.ts`) gives a revision-pinned
  install its own checkout keyed by `<repoName>/<sha>` instead of tracking a
  branch, so an addon never silently changes underneath a guild.
- **SSH commit signing**: before a commit goes live, `verifyCommitSignature()`
  (`packages/core/src/lib/downloader/signature.ts`) runs
  `git verify-commit -c gpg.format=ssh` against `ADDON_ALLOWED_SIGNERS_FILE`;
  with `ADDON_SIGNATURE_POLICY=require`, a failure throws
  `AddonSignatureRejectedError` and the install/update is refused.

## Consequences

A compromised addon process can't reach the database, Redis, or another
module's code, and can only call the specific host methods the SDK exposes.
Self-hosters get an explicit, auditable update step and can require every
commit be trusted-signed. The cost is operational: maintaining an
allowed-signers file, and an unsigned addon author can't run under
`ADDON_SIGNATURE_POLICY=require`.
