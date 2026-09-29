process.env["NODE_ENV"] ??= "development";

import "@sapphire/plugin-logger/register";
import "@sapphire/plugin-subcommands/register";
import "@sapphire/plugin-i18next/register";
import "@sapphire/plugin-utilities-store/register";

// Scheduled-tasks' plugin is deliberately NOT imported here anymore -
// `ScheduledTaskHandler`'s constructor builds a live BullMQ `Queue` *and*
// `Worker` unconditionally, and only `apps/scheduler` (`setup-scheduler.ts`)
// may run that `Worker` now. Every shard gets a producer-only `container.tasks`
// stand-in instead, installed by `LumiClient`'s constructor
// (`scheduler-producer.ts`).

if (process.env["NODE_ENV"] !== "production") {
  await import("@sapphire/plugin-hmr/register");
}
