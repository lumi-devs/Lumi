# Framework: Bank

Guild money: a wallet and a bank per member, every move written to an
audit ledger. No global mode, by design.

```ts
await api.bank.balance(userId);              // { wallet, bank, total }
await api.bank.deposit(userId, 100);
await api.bank.withdraw(userId, 50);
await api.bank.transfer(fromId, toId, 25);   // { sent, fee, received }
await api.bank.withCost(userId, 10, async () => {});  // refunds on throw
await api.bank.leaderboard(10);              // { entries, total }
await api.bank.position(userId);             // rank or null
await api.bank.prune();                      // delete zero-balance accounts
```

Account views and names, unscoped in `src/lib/api/economy/Bank.ts`
(all guild-scoped like the rest):

```ts
import { account, currencyName, bankName, AbortPurchase } from "#src/lib/api/economy/Bank.js";
await account(services, guildId, userId);  // { name, balance, createdAt }, auto-creates
await currencyName(services, guildId);     // e.g. "credits"
await bankName(services, guildId);         // e.g. "Bank"
```

`name` is the guild bank name, `balance` is wallet plus bank, and
`createdAt` is the earliest ledger entry (now for a fresh account):
`economy_accounts` carries no timestamp of its own. Throw
`AbortPurchase` inside `withCost` to refund the cost and resolve
silently; any other throw still refunds and propagates.

Need something custom? The same functions live unscoped in
`src/lib/economy/Bank.ts` (they take `services` first). Currency
names, starting balances, and caps live in the economy module config.
Leaderboards run as single SQL window queries, not in-memory sorts.
