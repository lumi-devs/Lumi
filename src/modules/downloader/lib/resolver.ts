import { container } from '@sapphire/framework';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { ModuleInfo } from './types.js';

const execAsync = promisify(exec);
const MODULE_ROOT = path.join(process.cwd(), 'data', '3rd-party-modules');

/**
 * Handles the logic of cloning repositories, verifying info.json,
 * and resolving dependencies.
 */
export class DownloadResolver {
  public async addRepo(name: string, url: string, branch = 'master'): Promise<void> {
    const repoPath = path.join(MODULE_ROOT, name);
    
    // Clone or pull
    if (await this._exists(repoPath)) {
      container.logger.info(`[Downloader] Updating repo: ${name}`);
      await execAsync(`git -C ${repoPath} pull origin ${branch}`);
    } else {
      container.logger.info(`[Downloader] Cloning repo: ${url}`);
      await execAsync(`git clone -b ${branch} ${url} ${repoPath}`);
    }
  }

  public async getModulesInRepo(repoName: string): Promise<ModuleInfo[]> {
    const repoPath = path.join(MODULE_ROOT, repoName);
    const entries = await fs.readdir(repoPath, { withFileTypes: true });
    
    const modules: ModuleInfo[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
      
      const infoPath = path.join(repoPath, entry.name, 'info.json');
      if (await this._exists(infoPath)) {
        try {
          const info = JSON.parse(await fs.readFile(infoPath, 'utf8')) as ModuleInfo;
          modules.push(info);
        } catch (err) {
          container.logger.warn(`[Downloader] Failed to parse info.json for ${entry.name}:`, err);
        }
      }
    }
    return modules;
  }

  public async installModule(repoName: string, moduleName: string): Promise<void> {
    const sourcePath = path.join(MODULE_ROOT, repoName, moduleName);
    const targetPath = path.join(process.cwd(), 'src', 'modules', moduleName);

    if (!(await this._exists(sourcePath))) {
      throw new Error(`Module ${moduleName} not found in repo ${repoName}`);
    }

    // Read info.json for requirements
    const infoPath = path.join(sourcePath, 'info.json');
    const info = JSON.parse(await fs.readFile(infoPath, 'utf8')) as ModuleInfo;

    // Install npm requirements if any
    if (info.requirements?.length) {
      container.logger.info(`[Downloader] Installing requirements for ${moduleName}: ${info.requirements.join(', ')}`);
      await execAsync(`bun add ${info.requirements.join(' ')}`);
    }

    // Create a symlink from data/ to src/modules/
    // This allows the ModuleManager to discover it naturally.
    if (await this._exists(targetPath)) {
        await fs.unlink(targetPath);
    }
    await fs.symlink(sourcePath, targetPath, 'dir');
    
    container.logger.info(`[Downloader] Installed ${moduleName} from ${repoName}`);
  }

  private async _exists(p: string): Promise<boolean> {
    try {
      await fs.access(p);
      return true;
    } catch {
      return false;
    }
  }
}

export const resolver = new DownloadResolver();
