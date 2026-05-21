// Side-effecting setup — imported first by main.ts.
// Order matters: env must load before anything that reads it.

process.env['NODE_ENV'] ??= 'development';

import { setup } from '@skyra/env-utilities';

// Load .env relative to the project root.
setup(new URL('../../.env', import.meta.url));

import '@sapphire/plugin-logger/register';
import '@sapphire/plugin-scheduled-tasks/register';
import '@sapphire/plugin-subcommands/register';
import '@sapphire/plugin-i18next/register';
