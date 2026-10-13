import { container } from "#src/lib/Services.js";
import { coreRpc, downloaderRpc } from "#src/contracts/rpc/Index.ts";
import { resolver } from "#src/lib/downloader/Resolver.js";
import { getUtility } from "#src/lib/module-system/Utility.js";
import { implementRpc } from "#src/lib/rpc/Implement.js";
import { paginate } from "#src/lib/rpc/Validation.js";

export const coreRpcHandlers = implementRpc(coreRpc, {
  "guild.permits.list": async ({ guildId }) => ({
    permits: await getUtility("permissions").listPermits(container, guildId),
  }),

  "guild.permits.create": async ({ guildId, input }) => {
    const permit = await getUtility("permissions").createPermit(
      container,
      guildId,
      input.name,
      input.kind,
      input.nodes,
    );
    return { success: true, permit };
  },

  "guild.permits.update": async ({ guildId, input }) => {
    const permissions = getUtility("permissions");
    if (input.name !== undefined) {
      await permissions.renamePermit(container, guildId, input.permitId, input.name);
    }
    const permit =
      input.nodes !== undefined
        ? await permissions.updatePermitNodes(container, guildId, input.permitId, input.nodes)
        : await permissions.getPermit(container, guildId, input.permitId);
    return { success: true, permit };
  },

  "guild.permits.delete": async ({ guildId, input }) => {
    await getUtility("permissions").deletePermit(container, guildId, input.permitId);
    return { success: true };
  },

  "guild.permits.move": async ({ guildId, input }) => {
    await getUtility("permissions").movePermit(container, guildId, input.permitId, input.direction);
    return { success: true };
  },

  "guild.permits.assign": async ({ guildId, input }) => {
    await getUtility("permissions").assignPermit(
      container,
      guildId,
      input.permitId,
      input.targetType,
      input.targetId,
    );
    return { success: true };
  },

  "guild.permits.unassign": async ({ guildId, input }) => {
    await getUtility("permissions").unassignPermit(
      container,
      guildId,
      input.permitId,
      input.targetType,
      input.targetId,
    );
    return { success: true };
  },

  "guild.blocklist.list": async ({ guildId, input }) => {
    const { page, pageSize, skip, take } = paginate(input);
    const { entries, total } = await container.db.access.listBlocklist(guildId, {
      skip,
      take,
    });
    return {
      entries: entries.map((entry) => ({
        id: "id" in entry ? String(entry.id) : entry.userId,
        userId: entry.userId,
        reason: entry.reason,
        blockedBy: entry.blockedBy,
        createdAt: entry.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  },

  "guild.blocklist.add": async ({ guildId, actorId, input }) => {
    if (await container.db.access.isUserBlocklisted(input.userId, guildId)) {
      throw new Error(`${input.userId} is already blocklisted in this server`);
    }
    await container.db.access.addBlocklistEntry(
      input.userId,
      actorId,
      input.reason,
      guildId,
    );
    return { success: true, userId: input.userId };
  },

  "guild.blocklist.remove": async ({ guildId, input }) => {
    await container.db.access.removeBlocklistEntry(input.userId, guildId);
    return { success: true, userId: input.userId };
  },

  "guild.ignored.list": async ({ guildId }) => {
    const entries = await container.db.access.listIgnoreEntries(guildId);
    return {
      entries: entries.map((entry) => ({
        id: entry.id,
        channelId: entry.channelId,
        createdAt: entry.createdAt.toISOString(),
      })),
    };
  },

  "guild.ignored.add": async ({ guildId, input }) => {
    const { channelId } = input;
    const alreadyIgnored = channelId
      ? (await container.db.access.listIgnoreEntries(guildId)).some(
          (entry) => entry.channelId === channelId,
        )
      : (await container.db.config.getGuildSettings(guildId)).ignored;
    if (alreadyIgnored) {
      throw new Error(
        channelId
          ? `<#${channelId}> is already ignored`
          : "This server is already ignored",
      );
    }

    await container.db.ensureGuild(guildId);
    await container.db.access.addIgnoreEntry(guildId, channelId);
    return { success: true, channelId };
  },

  "guild.ignored.remove": async ({ guildId, input }) => {
    await container.db.access.removeIgnoreEntry(guildId, input.channelId);
    return { success: true, channelId: input.channelId };
  },
});

export const downloaderRpcHandlers = implementRpc(downloaderRpc, {
  "downloader.repo.add": async ({ input }) => {
    await getUtility("downloader").addRepo(
      container,
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
        (installed: { moduleName: string; commit: string | null; pinned: boolean }) => [
          installed.moduleName,
          installed,
        ],
      ) || [],
    );
    return {
      repoName: input.repoName,
      modules: modules.map((mod) => {
        const installed = installedMap.get(mod.name);
        return {
          ...mod,
          isInstalled: !!installed,
          commit: installed?.commit ?? null,
          pinned: installed?.pinned ?? false,
        };
      }),
    };
  },

  "downloader.module.install": async ({ input }) => {
    await getUtility("downloader").installModule(
      container,
      input.repoName,
      input.moduleName,
      input.revision,
    );
    return { success: true, moduleName: input.moduleName };
  },

  "downloader.module.uninstall": async ({ input }) => {
    await getUtility("downloader").uninstallModule(container, input.moduleName);
    return { success: true, moduleName: input.moduleName };
  },

  "downloader.module.rollback": async ({ input }) => {
    const result = await getUtility("downloader").rollbackModule(
      container,
      input.moduleName,
      input.revision,
    );
    return { success: true, moduleName: input.moduleName, commit: result.commit };
  },
});
