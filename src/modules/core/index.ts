import { FieldType, type ModuleMeta } from '#lib/module-system.js';

/**
 * Core module — framework-level commands, listeners, preconditions, and
 * interaction handlers that the bot can't run without. Always enabled; the
 * `/config global-disable` command refuses to toggle this name.
 */
export const meta: ModuleMeta = {
	name: 'core',
	displayName: 'Core',
	emoji: '⚙️',
	description: 'Framework commands, error handlers, and preconditions. Cannot be disabled.',
	configFields: [
		{
			key: 'dashboard_enabled',
			label: 'Enable Dashboard',
			type: FieldType.BOOLEAN,
			description: 'Allow the external web dashboard to manage settings for this server.',
			default: true
		}
	],
	onLoad: () => {
		// Core onLoad logic (if any)
	}
};
