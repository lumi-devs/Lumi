// Side-effecting setup — imported first by main.ts.
// Order matters: env must load before anything that reads it.

process.env["NODE_ENV"] ??= "development";

import "@sapphire/plugin-api/register";
import "@sapphire/plugin-logger/register";
import "@sapphire/plugin-scheduled-tasks/register";
import "@sapphire/plugin-subcommands/register";
import "@sapphire/plugin-i18next/register";
import "@sapphire/plugin-editable-commands/register";
import "sapphire-plugin-modal-commands/register";
