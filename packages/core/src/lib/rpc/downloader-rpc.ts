import { container } from "@sapphire/framework";
import { downloaderRpc } from "@lumi/contracts/rpc";
import { resolver } from "#lib/downloader/resolver.js";
import { getUtility } from "#lib/module-system/Utility.js";
import { implementRpc } from "#lib/rpc/implement.js";

export const downloaderRpcHandlers = implementRpc(downloaderRpc, {
  "downloader.repo.add": async ({ input }) => {
    await getUtility("downloader").addRepo(
      input.name,
      input.url,
      input.branch || "default",
    );
    return { success: true };
  },

  "downloader.repo.list": async () => ({
    repos: await container.db.downloader.readAllDownloaderRepos(),
  }),

  "downloader.repo.modules": async ({ input }) => {
    const modules = await resolver.getModulesInRepo(input.repoName);
    const repo = await container.db.downloader.readDownloaderRepoWithModules(
      input.repoName,
    );
    const installedMap = new Map(
      repo?.installedModules.map(
        (m: { moduleName: string; commit: string | null; pinned: boolean }) => [
          m.moduleName,
          m,
        ],
      ) || [],
    );
    return {
      repoName: input.repoName,
      modules: modules.map((m) => {
        const installed = installedMap.get(m.name);
        return {
          ...m,
          isInstalled: !!installed,
          commit: installed?.commit ?? null,
          pinned: installed?.pinned ?? false,
        };
      }),
    };
  },

  "downloader.module.install": async ({ input }) => {
    await getUtility("downloader").installModule(
      input.repoName,
      input.moduleName,
      input.revision,
    );
    return { success: true, moduleName: input.moduleName };
  },

  "downloader.module.uninstall": async ({ input }) => {
    await getUtility("downloader").uninstallModule(input.moduleName);
    return { success: true, moduleName: input.moduleName };
  },

  "downloader.module.rollback": async ({ input }) => {
    const result = await getUtility("downloader").rollbackModule(
      input.moduleName,
      input.revision,
    );
    return { success: true, moduleName: input.moduleName, commit: result.commit };
  },
});
