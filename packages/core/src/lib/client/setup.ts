process.env["NODE_ENV"] ??= "development";

import "@sapphire/plugin-logger/register";
import "@sapphire/plugin-hmr/register";
import "@sapphire/plugin-subcommands/register";
import "@sapphire/plugin-i18next/register";
import "@sapphire/plugin-editable-commands/register";
import "@sapphire/plugin-pattern-commands/register";
import "@sapphire/plugin-utilities-store/register";

import { getServiceRole, roleOwnsScheduler } from "#lib/env.js";
if (roleOwnsScheduler(getServiceRole())) {
  await import("@sapphire/plugin-scheduled-tasks/register");
}
