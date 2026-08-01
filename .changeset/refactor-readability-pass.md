---
"@lumi/core": patch
---

Readability pass over the core package: no behaviour change.

Moderation commands now share a `ModerationCommand` / `ModerationSubcommand`
base in `lib/moderation/`, which owns the defer → translate → resolve target →
act → reply pipeline that eight commands each hand-rolled. Commands declare
`resolveTarget`, `action` and `buildSuccessMessage`; the optional `preHandle`
hook exists because `CommandContext` binds positional prefix arguments in
getter-call order, so options sitting between target and reason (`timeout`'s
duration, `ban add`'s `delete_days`) need a slot in the fixed call order.

`BaseCommand` and `BaseSubcommand` no longer carry duplicate
`reply*`/`checkPermit` wrappers - nothing called them. Command builder defaults
are applied through a prototype-inheriting registry view rather than by
temporarily overwriting `registerChatInputCommand` and restoring it in a
`finally`, so the shared registry is never mutated.

Oversized files are split along existing conventions: `lib/i18n/keys.ts` becomes
a barrel over per-domain files under `i18n/keys/`; `LumiClient` composes
`ReadinessProbes` and `CommandRegistrationLeaderElection` instead of
implementing them; the hub and config panels move their view builders into
`modules/core/ui/`; and every module now follows one-Piece-per-file for
interaction handlers.

`DownloaderService.syncApplicationCommands` reads an undocumented private field
of Sapphire's `ApplicationCommandRegistry` to re-sync slash commands after a
live addon install. That is now documented and guarded - if the field
disappears in a future `@sapphire/framework`, the sync is skipped with a warning
rather than throwing.
