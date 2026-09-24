process.env["NODE_ENV"] ??= "development";

// Deliberately narrower than `setup.ts` (the worker's side-effect entry
// point): no scheduled-tasks plugin (its `ScheduledTaskHandler` constructs a
// live BullMQ `Queue` and `Worker` the moment a client carrying its `tasks`
// option exists, independent of `login()` - this process must never run a
// second copy of the primary shard's job worker) and no hmr/i18next/
// subcommands plugins, none of which any `modules/*/rpc.ts` handler needs.
// `@sapphire/plugin-utilities-store` is kept: dashboard's config-writing RPC
// actions (`modules/dashboard/rpc.ts`'s `getUtility("config")` calls) read a
// module's "config" utility piece out of the store this plugin registers.
import "@sapphire/plugin-utilities-store/register";
