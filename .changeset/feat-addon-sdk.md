---
"@lumi/core": minor
---

Add a public addon SDK (`"lumi"`, `"lumi/commands"`, `"lumi/permissions"`, `"lumi/scheduling"`, `"lumi/ui"`, `"lumi/utils"`), modeled on Red-DiscordBot's `redbot.core`/`redbot.core.commands` namespacing, as a real Node/Bun package self-reference against the repo root. Third-party addon code should import from these instead of reaching into `#core/*`, `#lib/*`, `#utilities/*`, or `#database/*` directly - the Downloader's addon linter (`validateAddon`) now warns when it sees a direct internal-path import. Fixes a latent bug where addons declaring `requirements` in `info.json` got a synthetic local `package.json` that silently broke all internal-path resolution, `"lumi"` included, by creating a closer package boundary than the root.

Also adds a one-time confirmation prompt before `,repo add` clones a third-party repository (warns that addon code runs inside the bot process with full container access), and `,module pin <name>` / `,module unpin <name>` (mirroring Red's `[p]cog pin`/`unpin`) to freeze an installed addon's version against `,module update`.
