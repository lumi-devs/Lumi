/**
 * Every Ember module in a remote repository must have an info.json file
 * in its root directory to be recognized by the Downloader.
 */
export interface ModuleInfo {
	name: string;
	author: string[];
	description: string;
	short: string;
	version: string;
	requirements?: string[]; // npm packages to install
	tags?: string[];
	min_bot_version?: string;
	hidden?: boolean;
}
