# Levels

Guild XP. Members earn it by chatting and hanging out in voice. You
read and adjust it through `api.levels`:

```ts
await api.levels.account(userId);         // level, xp, totals, counters
await api.levels.addXp(userId, 100);      // removeXp, addLevels, removeLevels
await api.levels.setLevel(userId, 10);    // optional progress: setLevel(id, 10, 25)
await api.levels.board("overall", 10);    // entries + total
await api.levels.rankOf(userId);          // rank or null
```

Boards: `"overall"` (all-time), `"voice"` (minutes in voice),
`"weekly"` / `"monthly"` (XP gained in the last 7 / 30 days, read
from the `level_xp_gains` ledger).

The `level_formula` config picks the curve: `disgaea` (default),
`fibonacci`, `linear`, `mee6`, `atlas`, `arcane`, `lurkr`. Curves live
in `src/modules/leveling/services/Formulas.ts`.

Rules that matter: one rewarded message per cooldown (default 1 min,
but every message still counts), voice minutes only while audible
(not alone, muted, or deafened), level-ups announce and hand out roles
from the service layer, admin edits land in the ledger so weekly and
monthly boards stay honest.
