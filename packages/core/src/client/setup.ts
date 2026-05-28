// Side-effecting setup — imported first by main.ts.
// Order matters: env must load before anything that reads it.

process.env["NODE_ENV"] ??= "development";

import "@sapphire/plugin-api/register";
import "@sapphire/plugin-logger/register";
import "@sapphire/plugin-subcommands/register";
import "@sapphire/plugin-editable-commands/register";
import "sapphire-plugin-modal-commands/register";

// S5: only the BullMQ-owning roles (scheduler, monolith) register the
// scheduled-tasks plugin. On worker / gateway it stays unregistered so the
// process doesn't spin up a competing BullMQ Worker — task fires arrive over
// the scheduler bus instead (see @ember/core/lib/scheduler-bus.ts).
import { getEmberRole, roleOwnsScheduler } from "#lib/env.js";
if (roleOwnsScheduler(getEmberRole())) {
  await import("@sapphire/plugin-scheduled-tasks/register");
}
