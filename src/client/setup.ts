// Side-effecting setup — imported first by main.ts.
// Order matters: env must load before anything that reads it.

process.env['NODE_ENV'] ??= 'development';

import '@sapphire/plugin-logger/register';
import '@sapphire/plugin-scheduled-tasks/register';
import '@sapphire/plugin-subcommands/register';
import '@sapphire/plugin-i18next/register';
