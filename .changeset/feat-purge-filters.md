---
"@lumi/core": minor
---

`/purge` gains Red-DiscordBot-style filtered cleanup subcommands alongside
the existing plain `messages` variant: `user` (a specific member's
messages), `bots`, `links` (messages containing a URL), `regex` (custom
pattern), and `duration` (messages newer than a given age, e.g. `10m`/`2h`).
Each supports an optional `amount` cap (default 100) and reuses the existing
rate-limit-aware bulk/individual delete machinery and >50-message
confirmation prompt. `/purge` now also has full slash-command support
(previously prefix-only).
