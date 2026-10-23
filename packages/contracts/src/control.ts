export type ModuleOrigin = "bundled" | "addon";
export type ModuleState = "loaded" | "disabled" | "failed";

export interface ModuleStatus {
  name: string;
  displayName: string;
  emoji: string;
  description: string;
  version: string;
  origin: ModuleOrigin;
  state: ModuleState;
  commandCount: number;
  error?: string;
}

export interface ModuleControl {
  status(): readonly ModuleStatus[];
  reload(name: string): Promise<void>;
  setEnabled(name: string, enabled: boolean): Promise<void>;
  unloadAll(): Promise<void>;
}

export interface AddonRepoSummary {
  name: string;
  url: string;
  branch: string;
  commit: string;
}

export interface AddonModuleSummary {
  moduleName: string;
  version: string;
  commit: string;
  /** Repository the module was installed from, when known. */
  repoName?: string;
}

export interface AddonAvailable {
  name: string;
  displayName: string;
  description: string;
  version: string;
  errors: string[];
  warnings: string[];
}

export interface AddonInstallResult {
  manifest: { name: string; version: string; displayName: string };
  commit: string;
}

export interface AddonUpdateResult {
  name: string;
  oldSha: string;
  newSha: string;
  changed: boolean;
  modules: string[];
}

export type AddonUpdateOutcome = AddonUpdateResult | { name: string; error: string };

export interface AddonControl {
  addRepo(name: string, url: string, branch?: string): Promise<AddonRepoSummary>;
  updateRepo(name: string): Promise<AddonUpdateResult>;
  updateAll(): Promise<readonly AddonUpdateOutcome[]>;
  removeRepo(name: string): Promise<void>;
  install(repo: string, module: string, revision?: string): Promise<AddonInstallResult>;
  uninstall(module: string): Promise<void>;
  listRepos(): Promise<readonly AddonRepoSummary[]>;
  listInstalled(): Promise<readonly AddonModuleSummary[]>;
  listAvailable(repo: string): Promise<readonly AddonAvailable[]>;
}
