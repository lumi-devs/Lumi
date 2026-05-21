import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { container, type Container } from '@sapphire/framework';
import type { RequesterType } from '#lib/gdpr.js';

// ─────────────────────────────────────────────────────────────────────────────
// Public meta
// ─────────────────────────────────────────────────────────────────────────────

export const enum FieldType {
	CHANNEL = 'channel',
	ROLE = 'role',
	USER = 'user',
	TEXT = 'text',
	BOOLEAN = 'boolean',
	NUMBER = 'number',
	ENUM = 'enum'
}

export interface ConfigField {
	key: string;
	label: string;
	type: FieldType;
	required?: boolean;
	default?: unknown;
	description?: string;
	choices?: string[];
}

export interface ModuleMeta {
	/** Unique kebab-case identifier. Used as DB key, Redis namespace, RPC scope. */
	name: string;
	displayName: string;
	emoji: string;
	description: string;
	version?: string;
	configFields?: ConfigField[];

	/** Modules that must be loaded before this one. */
	dependencies?: string[];
	/** Modules that cannot coexist with this one. */
	conflicts?: string[];

	/**
	 * Called after the module's piece dirs are registered with Sapphire, before
	 * login. Register services on `container.modules.<name>` here.
	 */
	onLoad?: (container: Container) => void | Promise<void>;

	/** Called on unload (manual reload or shutdown). Resources owned must be freed. */
	onUnload?: (container: Container) => void | Promise<void>;

	/** Wipe user-owned data for GDPR deletion. */
	deleteUserData?: (userId: string, requester: RequesterType) => Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Discovered record
// ─────────────────────────────────────────────────────────────────────────────

export type ModuleState = 'discovered' | 'loaded' | 'failed' | 'disabled' | 'skipped-conflict';

export interface PieceLoadFailure {
	path: string;
	error: Error;
}

export interface ModuleRecord {
	readonly meta: ModuleMeta;
	readonly dir: string; // absolute path on disk
	readonly indexUrl: string; // file:// URL of the module's index.ts
	enabled: boolean; // global (DB-backed) enabled state
	state: ModuleState;
	error?: Error;
	pieceErrors?: PieceLoadFailure[];
}

const PIECE_EXTENSIONS = new Set(['.ts', '.cts', '.mts', '.js', '.cjs', '.mjs']);

// ─────────────────────────────────────────────────────────────────────────────
// Manager
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Discovers, loads, unloads, and reloads modules.
 *
 * Discovery is purely filesystem-driven — no module name is hardcoded
 * anywhere. Drop a folder under `src/modules/<name>/` (or nested
 * `src/modules/<category>/<name>/`) with an `index.ts` exporting `meta`
 * and the manager picks it up.
 *
 * Layouts supported:
 *
 *   modules/<name>/index.ts                  flat
 *   modules/<category>/<name>/index.ts       categorised
 *
 * A "category" directory is detected by *not* having its own `index.ts`.
 *
 * Persistence: global enabled state is read from / written to the
 * `GlobalModuleState` Prisma table. Per-guild enabled state lives in
 * `GuildModuleState` and is queried by the `ModuleEnabled` precondition,
 * not by this class.
 *
 * Mirrors the design of the Python `_cog_manager.py` in ../Ember-staging.
 */
export class ModuleManager {
	private readonly _roots: URL[];
	private readonly _records = new Map<string, ModuleRecord>();
	private _loadOrder: string[] = [];
	private _piecesRegistered = false;

	public constructor(...roots: URL[]) {
		this._roots = roots;
	}

	// ── Public surface ─────────────────────────────────────────────────────

	public get(name: string): ModuleRecord | undefined {
		return this._records.get(name);
	}

	public has(name: string): boolean {
		return this._records.has(name);
	}

	public all(): ModuleRecord[] {
		return [...this._records.values()];
	}

	public loaded(): ModuleRecord[] {
		return this.all().filter((r) => r.state === 'loaded');
	}

	// ── Discover ──────────────────────────────────────────────────────────

	/**
	 * Walk every root, find every `index.ts`, import it, collect `meta`.
	 * Re-discovery preserves the loaded-state of records already in the map.
	 */
	public async discover(): Promise<ModuleRecord[]> {
		const found = new Map<string, ModuleRecord>();
		const globalState = await this._readGlobalState();

		for (const root of this._roots) {
			const rootPath = fileURLToPath(root);
			if (!(await this._exists(rootPath))) {
				container.logger.warn(`[Modules] root does not exist: ${rootPath}`);
				continue;
			}
			await this._walk(rootPath, found, globalState);
		}

		// Preserve loaded state across rediscoveries.
		for (const [name, record] of found) {
			const previous = this._records.get(name);
			if (previous && previous.state === 'loaded') record.state = 'loaded';
		}

		this._records.clear();
		for (const [name, record] of found) this._records.set(name, record);

		this._applyConflicts();
		this._loadOrder = this._topoSort();
		return [...this._records.values()];
	}

	// ── Pieces registration (one-shot — must run before client.login) ─────

	public registerPieces(): void {
		if (this._piecesRegistered) return;
		for (const name of this._loadOrder) {
			const record = this._records.get(name);
			if (!record || !record.enabled || record.state === 'skipped-conflict') continue;
			container.stores.registerPath(pathToFileURL(record.dir));
			container.logger.info(`[Modules] ${record.meta.emoji} ${record.meta.displayName} — pieces registered`);
		}
		this._piecesRegistered = true;
	}

	// ── Load / unload / reload ────────────────────────────────────────────

	public async loadAll(): Promise<{ loaded: number; failed: number; skipped: number }> {
		let loaded = 0;
		let failed = 0;
		let skipped = 0;
		for (const name of this._loadOrder) {
			const record = this._records.get(name)!;
			if (!record.enabled) {
				record.state = 'disabled';
				skipped++;
				continue;
			}
			if (record.state === 'skipped-conflict') {
				skipped++;
				continue;
			}
			(await this.load(name)) ? loaded++ : failed++;
		}
		container.logger.info(`[Modules] loadAll → loaded=${loaded} failed=${failed} skipped=${skipped}`);
		return { loaded, failed, skipped };
	}

	public async load(name: string): Promise<boolean> {
		const record = this._records.get(name);
		if (!record) {
			container.logger.error(`[Modules] load: unknown "${name}"`);
			return false;
		}
		if (record.state === 'loaded') return true;
		if (!record.enabled) {
			record.state = 'disabled';
			return false;
		}

		// Ensure deps are loaded first
		for (const dep of record.meta.dependencies ?? []) {
			const depRec = this._records.get(dep);
			if (!depRec || !depRec.enabled) {
				record.error = new Error(`missing/disabled dependency: ${dep}`);
				record.state = 'failed';
				container.logger.error(`[Modules] ${name}: cannot load — ${record.error.message}`);
				return false;
			}
			if (depRec.state !== 'loaded' && !(await this.load(dep))) return false;
		}

		// Verify every piece file under the module dir imports cleanly. Sapphire's
		// stores load pieces later (during client.login), and a broken import is
		// only logged via LoaderStrategy.onError — it never bubbles back here. So
		// without this pre-check, the module is reported "loaded" while half its
		// commands/listeners silently failed.
		const pieceErrors = await this._verifyPieces(record.dir);
		if (pieceErrors.length) {
			record.pieceErrors = pieceErrors;
			record.error = new Error(
				`${pieceErrors.length} piece file(s) failed to import:\n` +
					pieceErrors.map((e) => `  - ${e.path}: ${e.error.message}`).join('\n')
			);
			record.state = 'failed';
			container.logger.error(`[Modules] ${name}: ${record.error.message}`);
			return false;
		}

		try {
			await record.meta.onLoad?.(container);
			record.state = 'loaded';
			record.error = undefined;
			record.pieceErrors = undefined;
			container.logger.info(`[Modules] ${record.meta.emoji} ${record.meta.displayName} — loaded`);
			return true;
		} catch (err) {
			record.error = err instanceof Error ? err : new Error(String(err));
			record.state = 'failed';
			container.logger.error(`[Modules] ${name}: onLoad failed`, err);
			return false;
		}
	}

	public async unload(name: string): Promise<boolean> {
		const record = this._records.get(name);
		if (!record || record.state !== 'loaded') return false;

		// Refuse to unload while dependents are still loaded
		const dependents = this.all().filter(
			(r) => r.state === 'loaded' && (r.meta.dependencies ?? []).includes(name)
		);
		if (dependents.length) {
			container.logger.warn(
				`[Modules] cannot unload "${name}" — dependents loaded: ${dependents.map((d) => d.meta.name).join(', ')}`
			);
			return false;
		}

		try {
			await record.meta.onUnload?.(container);
		} catch (err) {
			container.logger.warn(`[Modules] ${name}: onUnload threw (continuing):`, err);
		}
		Reflect.deleteProperty(container.modules, name);
		record.state = 'discovered';
		container.logger.info(`[Modules] ${record.meta.displayName} — unloaded`);
		return true;
	}

	public async reload(name: string): Promise<boolean> {
		if (this.has(name) && this.get(name)!.state === 'loaded' && !(await this.unload(name))) return false;
		// Re-import the module's index.ts so source changes take effect (dev only).
		const record = this._records.get(name);
		if (record) {
			try {
				const mod = (await import(`${record.indexUrl}?t=${Date.now()}`)) as { meta?: ModuleMeta };
				if (mod.meta) (record as { meta: ModuleMeta }).meta = mod.meta;
			} catch (err) {
				container.logger.warn(`[Modules] ${name}: reimport failed:`, err);
			}
		}
		return this.load(name);
	}

	public async unloadAll(): Promise<void> {
		for (const name of [...this._loadOrder].reverse()) {
			if (this.get(name)?.state === 'loaded') await this.unload(name);
		}
	}

	// ── Enabled-state persistence ─────────────────────────────────────────

	public async setEnabled(name: string, enabled: boolean, reason?: string): Promise<void> {
		const record = this._records.get(name);
		if (!record) throw new Error(`Unknown module: ${name}`);
		record.enabled = enabled;
		await container.prisma.globalModuleState.upsert({
			where: { moduleName: name },
			update: { enabled, reason: reason ?? null },
			create: { moduleName: name, enabled, reason: reason ?? null }
		});
		if (!enabled && record.state === 'loaded') await this.unload(name);
		else if (enabled && record.state !== 'loaded') await this.load(name);
	}

	public isEnabled(name: string): boolean {
		return this._records.get(name)?.enabled ?? false;
	}

	// ── GDPR fan-out ──────────────────────────────────────────────────────

	public async deleteUserData(userId: string, requester: RequesterType): Promise<string[]> {
		const failed: string[] = [];
		for (const record of this._records.values()) {
			if (!record.meta.deleteUserData) continue;
			try {
				await record.meta.deleteUserData(userId, requester);
			} catch (err) {
				container.logger.warn(`[Modules] ${record.meta.name}: deleteUserData failed:`, err);
				failed.push(record.meta.name);
			}
		}
		return failed;
	}

	// ── Internals ─────────────────────────────────────────────────────────

	/**
	 * Recursively walk one root. A directory is a module if it has `index.ts`;
	 * otherwise (no `index.ts` but contains subdirs) it's treated as a category
	 * and we recurse exactly one level deeper.
	 */
	private async _walk(
		dir: string,
		found: Map<string, ModuleRecord>,
		globalState: Map<string, boolean>,
		depth = 0
	): Promise<void> {
		let entries: string[];
		try {
			entries = await fs.readdir(dir);
		} catch {
			return;
		}

		for (const name of entries) {
			if (name.startsWith('_') || name.startsWith('.')) continue;
			const sub = path.join(dir, name);
			const stat = await fs.stat(sub).catch(() => null);
			if (!stat?.isDirectory()) continue;

			const indexPath = await this._findIndex(sub);
			if (indexPath) {
				await this._ingest(sub, indexPath, found, globalState);
			} else if (depth === 0) {
				// Treat as category — descend exactly one level
				await this._walk(sub, found, globalState, depth + 1);
			}
		}
	}

	private async _findIndex(dir: string): Promise<string | null> {
		for (const candidate of ['index.ts', 'index.js', 'index.mts']) {
			const p = path.join(dir, candidate);
			if (await this._exists(p)) return p;
		}
		return null;
	}

	private async _ingest(
		dir: string,
		indexPath: string,
		found: Map<string, ModuleRecord>,
		globalState: Map<string, boolean>
	): Promise<void> {
		const indexUrl = pathToFileURL(indexPath).href;
		try {
			const mod = (await import(indexUrl)) as { meta?: ModuleMeta; default?: { meta?: ModuleMeta } };
			const meta = mod.meta ?? mod.default?.meta;
			if (!meta) {
				container.logger.debug(`[Modules] ${dir}: no exported \`meta\` — skipping`);
				return;
			}
			if (found.has(meta.name)) {
				container.logger.warn(
					`[Modules] duplicate module name "${meta.name}" — keeping ${found.get(meta.name)!.dir}, ignoring ${dir}`
				);
				return;
			}
			found.set(meta.name, {
				meta,
				dir,
				indexUrl,
				enabled: globalState.get(meta.name) ?? true,
				state: 'discovered'
			});
		} catch (err) {
			container.logger.error(`[Modules] failed to import ${indexPath}:`, err);
		}
	}

	private async _exists(p: string): Promise<boolean> {
		try {
			await fs.access(p);
			return true;
		} catch {
			return false;
		}
	}

	private async _readGlobalState(): Promise<Map<string, boolean>> {
		try {
			const rows = await container.prisma.globalModuleState.findMany();
			return new Map(rows.map((r) => [r.moduleName, r.enabled]));
		} catch (err) {
			container.logger.warn('[Modules] could not read GlobalModuleState (DB not ready?):', err);
			return new Map();
		}
	}

	/** First-wins conflict resolution: deterministic by discovery order. */
	private _applyConflicts(): void {
		for (const record of this._records.values()) {
			if (record.state === 'skipped-conflict') continue;
			for (const conflictName of record.meta.conflicts ?? []) {
				const other = this._records.get(conflictName);
				if (other && other.state !== 'skipped-conflict') {
					other.state = 'skipped-conflict';
					container.logger.warn(
						`[Modules] "${conflictName}" conflicts with "${record.meta.name}" — skipping ${conflictName}`
					);
				}
			}
		}
	}

	/**
	 * Walk every file under the module directory (skipping `index.ts`, which is
	 * already imported during discovery) and try to import it. Returns the list
	 * of files that threw — caller decides whether to mark the module failed.
	 *
	 * Imports use the bare file:// URL (no cache-busting query param), while
	 * Sapphire's LoaderStrategy uses a unique `?d=<timestamp>` param. The two
	 * imports land in different module-cache entries, so a pre-import here does
	 * NOT cause decorators / class registration to run twice for Sapphire — this
	 * is purely a syntax/resolution smoke test.
	 */
	private async _verifyPieces(dir: string): Promise<PieceLoadFailure[]> {
		const failures: PieceLoadFailure[] = [];
		const indexes = new Set(['index.ts', 'index.js', 'index.mts', 'index.cts', 'index.cjs', 'index.mjs']);

		const walk = async (current: string): Promise<void> => {
			let entries: string[];
			try {
				entries = await fs.readdir(current);
			} catch {
				return;
			}
			for (const name of entries) {
				if (name.startsWith('_') || name.startsWith('.')) continue;
				const full = path.join(current, name);
				const stat = await fs.stat(full).catch(() => null);
				if (!stat) continue;

				if (stat.isDirectory()) {
					await walk(full);
					continue;
				}
				if (!stat.isFile()) continue;
				if (current === dir && indexes.has(name)) continue; // index already imported in _ingest
				if (name.endsWith('.d.ts')) continue;
				const ext = path.extname(name);
				if (!PIECE_EXTENSIONS.has(ext)) continue;

				try {
					await import(pathToFileURL(full).href);
				} catch (err) {
					failures.push({ path: full, error: err instanceof Error ? err : new Error(String(err)) });
				}
			}
		};

		await walk(dir);
		return failures;
	}

	private _topoSort(): string[] {
		const order: string[] = [];
		const visited = new Set<string>();
		const visiting = new Set<string>();

		const visit = (name: string, stack: string[]): void => {
			if (visited.has(name)) return;
			if (visiting.has(name)) throw new Error(`Circular dependency: ${[...stack, name].join(' → ')}`);
			const record = this._records.get(name);
			if (!record) return;
			visiting.add(name);
			for (const dep of record.meta.dependencies ?? []) {
				if (!this._records.has(dep)) {
					container.logger.warn(`[Modules] ${name}: missing dependency "${dep}" — will fail to load`);
					continue;
				}
				visit(dep, [...stack, name]);
			}
			visiting.delete(name);
			visited.add(name);
			order.push(name);
		};

		for (const name of this._records.keys()) visit(name, []);
		return order;
	}
}
