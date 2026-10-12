# Developer Guarantees

Public API is exactly the set of names reachable from the addon `api` object. Everything else under `src/` is private and may change without notice.

- `api.moduleName`: the owning module name.
- `api.guildId`: the guild this call is scoped to.
- `api.config`: scoped config for this guild.
- `api.configFor(scope)`: config for an explicit scope.
- `api.bank`: balances, deposits, withdrawals, transfers, cost guards, leaderboard, prune.
- `api.levels`: accounts, XP/level mutation, boards, rank lookup.
- `api.permits`: `allows`/`check` against permit nodes for an actor.
- `api.ui`: success/error/info/warning/list card builders.
- `api.fmt`: shared string formatting helpers.
- `api.tokens`: `get(service)` for shared tokens.
- `api.kv`: per-module per-guild key-value get/set/del.
- `api.files`: per-module file dir/read/write/del/list.
- `api.flag(key)`: feature-flag check for this guild.
- `api.later(name, delayMs, data?)`: schedule a one-shot task.
- `api.spam(key, intervals)`: per-key anti-spam bucket.

Reserved member prefixes on addon modules: `lumi_` and `__lumi_*`. The framework may add members with these prefixes non-breakingly; addons must not declare methods or fields using them. The addon validator warns (does not reject) on such declarations.

RPC actions are versioned via the `x-lumi-contract-version` header against `@lumi/contracts`. A missing or incompatible version is rejected like a mismatch.

Breaking changes to the public API or RPC contract happen only on minor/major releases and are announced with a changelog notice.
