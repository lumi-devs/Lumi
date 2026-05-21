import type { ModuleMeta } from '#lib/module-system.js';

/**
 * Core module — framework-level commands, listeners, preconditions, and
 * interaction handlers that the bot can't run without. Always enabled; the
 * `/config global-disable` command refuses to toggle this name.
 */
export const meta: ModuleMeta = {
	name: 'core',
	displayName: 'Core',
	emoji: '⚙️',
	description: 'Framework commands, error handlers, and preconditions. Cannot be disabled.'
};
