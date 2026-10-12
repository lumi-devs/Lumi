# Publishing Addons

Third-party addons are plain git repos. No registry, no approval queue:
operators add your repo URL and install from chat.

## Repo shape

```
my-repo/                 # git repo
  manifest.json          # author, description, install_msg
  my-addon/
    manifest.json        # author, version, requirements, end_user_data_statement
    Index.ts             # defineModule entrypoint
```

Repo `manifest.json` carries `author`, `description`, `install_msg`.
Module `manifest.json` carries `author`, `version`, `requirements`,
`end_user_data_statement`, `min_bot_version` / `max_bot_version`.
Unknown keys warn, never fail; a `max_bot_version` below
`min_bot_version` is ignored.

## Signatures

Sign commits with SSH (`git commit -S`) and give operators your
`allowed_signers` entry. With `ADDON_SIGNATURE_POLICY=require`, unsigned
or untrusted commits are refused at install/update time. A revision-pinned
install gets its own checkout keyed by `<repo>/<sha>` and never silently
changes underneath a guild.

## Operator flow

```
lumi addon create <name>      # scaffold
lumi addon validate <dir>     # structure, import, and UI checks
/repo add <url>               # register the repo (chat, owner-only)
/module install <repo> <module>
/module update [module]       # or everything at once
/module pin <module>          # hold a revision across updates
```

Or drop the directory under `data/addons/` directly. Manage loaded code
with `/module load`, `unload`, `reload`, `status`.

## Rules the validator enforces

- Self-contained: no imports from sibling modules. Shared code comes
  from `src/lib/` or `src/contracts/`.
- No `container.prisma` / `container` global - use the `services`
  argument hooks receive.
- No `new EmbedBuilder()` in commands - use the card builders
  (`src/lib/ui/Cards.ts`) or `ctx.replySuccess` / `ctx.replyError`.
- `Index.ts` exports the `meta` object from `defineModule()`;
  `configFields` come from a `configSchema`, never hand-authored.
- User-facing reply strings go through the locale pipeline (`ctx.fetchT()`
  / `fetchTyped()` + `t("namespace:key")`). Replies without it warn,
  never fail.
