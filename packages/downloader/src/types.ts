export interface ModuleInfo {
  readonly name: string;
  readonly displayName: string;
  readonly emoji: string;
  readonly description: string;
  readonly version: string;
  readonly installed: boolean;
}

export interface RepoRecord {
  readonly id: number;
  readonly name: string;
  readonly url: string;
  readonly branch: string | null;
  readonly commit: string | null;
  readonly installed: number;
}

export interface InstalledAddon {
  readonly name: string;
  readonly version: string | null;
  readonly commit: string | null;
  readonly pinned: boolean;
  readonly installedAt: Date;
  readonly repoName: string;
}

export interface UpdateFailure {
  readonly module: string;
  readonly error: string;
}

export interface RepoUpdateResult {
  readonly repo: string;
  readonly oldCommit: string | null;
  readonly newCommit: string;
  readonly changed: boolean;
  readonly updated: readonly string[];
  readonly pinned: readonly string[];
  readonly failures: readonly UpdateFailure[];
}

export interface AutoUpdateState {
  readonly enabled: boolean;
  readonly intervalMinutes: number;
  readonly lastCheckedAt: string | null;
}

export interface AutoUpdateReport {
  readonly checked: number;
  readonly updated: readonly string[];
  readonly failures: readonly UpdateFailure[];
}

export interface AddonRuntime {
  mount(moduleName: string): Promise<void>;
  unmount(moduleName: string): Promise<void>;
  reload(moduleName: string): Promise<void>;
  has(moduleName: string): boolean;
}

export type AddonNotifier = (report: AutoUpdateReport) => Promise<void>;

export interface AddonLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
}
