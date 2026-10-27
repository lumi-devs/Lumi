export interface ModuleInfo {
  name: string;
  displayName: string;
  emoji: string;
  description: string;
  version: string;
  installed: boolean;
}

export interface RepoRecord {
  id: number;
  name: string;
  url: string;
  branch: string | null;
  commit: string | null;
  installed: number;
}

export interface InstalledAddon {
  name: string;
  version: string | null;
  commit: string | null;
  pinned: boolean;
  installedAt: Date;
  repoName: string;
}

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

export interface UpdateFailure {
  module: string;
  error: string;
}

export interface RepoUpdateResult {
  repo: string;
  oldCommit: string | null;
  newCommit: string;
  changed: boolean;
  updated: string[];
  pinned: string[];
  failures: UpdateFailure[];
}

export interface AutoUpdateState {
  enabled: boolean;
  intervalMinutes: number;
  lastCheckedAt: string | null;
}

export interface AutoUpdateReport {
  checked: number;
  updated: string[];
  failures: UpdateFailure[];
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
