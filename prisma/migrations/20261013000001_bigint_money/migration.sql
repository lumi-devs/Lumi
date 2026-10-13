-- Balances and ledger amounts outgrow 32-bit INT (fib(47) alone is 2.9B).
-- BIGINT keeps every existing value bit-identical; readers convert at the
-- repository boundary so no application behavior changes below 2^53.
ALTER TABLE "level_accounts" ALTER COLUMN "xp" SET DATA TYPE BIGINT;
ALTER TABLE "level_accounts" ALTER COLUMN "total_xp" SET DATA TYPE BIGINT;
ALTER TABLE "level_xp_gains" ALTER COLUMN "amount" SET DATA TYPE BIGINT;
ALTER TABLE "economy_accounts" ALTER COLUMN "wallet" SET DATA TYPE BIGINT;
ALTER TABLE "economy_accounts" ALTER COLUMN "bank" SET DATA TYPE BIGINT;
ALTER TABLE "economy_transactions" ALTER COLUMN "amount" SET DATA TYPE BIGINT;
ALTER TABLE "economy_transactions" ALTER COLUMN "balance_after" SET DATA TYPE BIGINT;
