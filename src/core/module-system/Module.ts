import { Piece } from '@sapphire/framework';
import type { Awaitable } from '@sapphire/utilities';
import type { RequesterType } from '#utilities/gdpr.js';

export interface ModuleOptions extends Piece.Options {
	displayName?: string;
	emoji?: string;
	description?: string;
	version?: string;
	dependencies?: string[];
	conflicts?: string[];
	isCore?: boolean;
}

export abstract class Module extends Piece {
	public readonly displayName: string;
	public readonly emoji: string;
	public readonly description: string;
	public readonly version: string;
	public readonly dependencies: string[];
	public readonly conflicts: string[];
	public readonly isCore: boolean;

	public constructor(context: Piece.LoaderContext, options: ModuleOptions = {}) {
		super(context, options);
		this.displayName = options.displayName ?? this.name;
		this.emoji = options.emoji ?? '⚙️';
		this.description = options.description ?? '';
		this.version = options.version ?? '1.0.0';
		this.dependencies = options.dependencies ?? [];
		this.conflicts = options.conflicts ?? [];
		this.isCore = options.isCore ?? false;
	}

	public get canDisable(): boolean {
		return !this.isCore;
	}

	public deleteUserData(_userId: string, _requester: RequesterType): Awaitable<void> {
		return undefined;
	}
}
