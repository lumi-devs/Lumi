import { FieldType, type ModuleMeta } from '#lib/module-system.js';
import { registerRpcHandler } from '#lib/rabbit.js';
import { readSettings } from '#lib/database/settings.js';

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
		// Register core RPC handlers for the dashboard
		registerRpcHandler('guild.config.get', async (req) => {
			if (!req.guildId) throw new Error('guildId is required');
			return readSettings(req.guildId);
		});
	}
};
