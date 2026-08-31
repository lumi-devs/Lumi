process.env["NODE_ENV"] ??= "development";

import "@sapphire/plugin-logger/register";
import "@sapphire/plugin-hmr/register";
import "@sapphire/plugin-subcommands/register";
import "@sapphire/plugin-i18next/register";
import "@sapphire/plugin-utilities-store/register";


import { isPrimaryShard } from "#lib/env.js";
// BullMQ's upsertJobScheduler has documented races when multiple processes
// call it concurrently at boot (taskforcesh/bullmq#3381, #2876) - only the
// primary shard registers the plugin, so exactly one process ever owns
// schedule upsert. Every process still executes fired task effects via the
// event-bus relay (TaskFireConsumer), which is unrelated to this plugin.
if (isPrimaryShard()) {
  await import("@sapphire/plugin-scheduled-tasks/register");
}
