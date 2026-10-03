/**
 * Every Lumi module in a remote repository must have an info.json file
 * in its root directory to be recognized by the Downloader.
 */
export interface ModuleInfo {
  name: string;
  author: string[];
  description: string;
  short?: string;
  version: string;
  emoji?: string;
  /**
   * Other modules this one requires, each either a plain name (`"economy"`)
   * or a name with a semver range (`"leveling@^1.2.0"`) that the installed
   * module's `version` must satisfy.
   */
  dependencies?: string[];
  conflicts?: string[];
  requirements?: string[];
  tags?: string[];
  min_bot_version?: string;
  max_bot_version?: string;
  end_user_data_statement: string;
  hidden?: boolean;
}
