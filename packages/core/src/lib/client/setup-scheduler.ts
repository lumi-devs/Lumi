process.env["NODE_ENV"] ??= "development";

// Deliberately narrower than `setup.ts` (the worker's side-effect entry
// point): only the scheduled-tasks plugin - this is now the one process that
// may construct it, since its `ScheduledTaskHandler` builds a live BullMQ
// `Queue` *and* `Worker` the moment a client carrying its `tasks` option is
// constructed, independent of `login()`. No i18n/subcommands/logger-register/
// hmr/utilities-store - nothing a `RelayTask` piece's `run()` needs.
import "@sapphire/plugin-scheduled-tasks/register";
