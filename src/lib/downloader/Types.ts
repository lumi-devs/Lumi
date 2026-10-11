export interface ModuleInfo {
  name: string;
  author: string[];
  description: string;
  short?: string;
  version: string;
  emoji?: string;
  dependencies?: string[];
  conflicts?: string[];
  required_modules?: Record<string, string>;
  requirements?: string[];
  tags?: string[];
  min_bot_version?: string;
  max_bot_version?: string;
  end_user_data_statement: string;
  hidden?: boolean;
  disabled?: boolean;
  install_msg?: string;
  type?: string;
}

export interface RepoInfo {
  author: string[];
  description: string;
  short?: string;
  install_msg?: string;
}
