import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "@lumi/module-kit";
import { makeListCard, makeSuccessCard } from "@lumi/ui";

export const addons: CommandDef = {
  name: "addons",
  description: "Install and update addon repositories.",
  module: null,
  ownerOnly: true,
  build: () =>
    new SlashCommandBuilder()
      .setName("addons")
      .setDescription("Manage addon repositories")
      .addStringOption((option) =>
        option
          .setName("action")
          .setDescription("What to do")
          .setRequired(true)
          .addChoices(
            { name: "list", value: "list" },
            { name: "repos", value: "repos" },
            { name: "available", value: "available" },
            { name: "install", value: "install" },
            { name: "uninstall", value: "uninstall" },
            { name: "repo-add", value: "repo-add" },
            { name: "repo-update", value: "repo-update" },
            { name: "repo-remove", value: "repo-remove" },
            { name: "update-all", value: "update-all" },
          ),
      )
      .addStringOption((option) => option.setName("repo").setDescription("Repository name"))
      .addStringOption((option) => option.setName("module").setDescription("Module name"))
      .addStringOption((option) => option.setName("url").setDescription("HTTPS git URL"))
      .addStringOption((option) => option.setName("branch").setDescription("Branch (default: remote default)"))
      .addStringOption((option) => option.setName("revision").setDescription("Commit, tag, or branch to install")),
  async run(ctx) {
    const action = (await ctx.getString("action")) ?? "list";
    const repo = await ctx.getString("repo");
    const module = await ctx.getString("module");
    const url = await ctx.getString("url");
    const branch = (await ctx.getString("branch")) ?? "default";
    const revision = (await ctx.getString("revision")) ?? undefined;
    const api = ctx.services.addons;

    if (action === "list") {
      const installed = await api.listInstalled();
      if (installed.length === 0) return ctx.replyInfo("Addons", "No addons installed.");
      return ctx.reply(
        makeListCard(
          "Installed addons",
          installed.map(
            (entry) =>
              `**${entry.moduleName}** \`v${entry.version}\` · \`${entry.commit.slice(0, 7)}\``,
          ),
        ),
      );
    }

    if (action === "repos") {
      const repos = await api.listRepos();
      if (repos.length === 0) return ctx.replyInfo("Repositories", "No repositories added.");
      return ctx.reply(
        makeListCard(
          "Repositories",
          repos.map(
            (entry) =>
              `**${entry.name}** · ${entry.branch} · \`${entry.commit.slice(0, 7)}\``,
          ),
        ),
      );
    }

    if (action === "available") {
      if (!repo) throw new Error("A repository name is required.");
      await ctx.defer();
      const available = await api.listAvailable(repo);
      if (available.length === 0) return ctx.replyInfo("Available addons", `Nothing found in **${repo}**.`);
      return ctx.reply(
        makeListCard(
          `Available in ${repo}`,
          available.map(
            (entry) =>
              `**${entry.displayName}** \`v${entry.version}\` — ${entry.description}${entry.errors.length > 0 ? `\n-# ${entry.errors.length} validation error(s)` : ""}`,
          ),
        ),
      );
    }

    if (action === "install") {
      if (!repo || !module) throw new Error("repo and module are required.");
      await ctx.defer();
      const result = await api.install(repo, module, revision);
      return ctx.reply(
        makeSuccessCard(
          "Addon installed",
          `**${result.manifest.displayName}** \`v${result.manifest.version}\` at \`${result.commit.slice(0, 7)}\`.`,
        ),
      );
    }

    if (action === "uninstall") {
      if (!module) throw new Error("A module name is required.");
      await ctx.defer();
      await api.uninstall(module);
      return ctx.reply(makeSuccessCard("Addon uninstalled", `**${module}** was removed.`));
    }

    if (action === "repo-add") {
      if (!repo || !url) throw new Error("repo and url are required.");
      await ctx.defer();
      const result = await api.addRepo(repo, url, branch);
      return ctx.reply(
        makeSuccessCard(
          "Repository added",
          `**${result.name}** at \`${result.commit.slice(0, 7)}\`.`,
        ),
      );
    }

    if (action === "repo-update") {
      if (!repo) throw new Error("A repository name is required.");
      await ctx.defer();
      const result = await api.updateRepo(repo);
      return ctx.reply(
        makeSuccessCard(
          result.changed ? "Repository updated" : "Already current",
          result.changed
            ? `**${repo}** moved to \`${result.newSha.slice(0, 7)}\`. Reloaded: ${result.modules.join(", ") || "none"}.`
            : `**${repo}** is already at \`${result.newSha.slice(0, 7)}\`.`,
        ),
      );
    }

    if (action === "repo-remove") {
      if (!repo) throw new Error("A repository name is required.");
      await ctx.defer();
      await api.removeRepo(repo);
      return ctx.reply(makeSuccessCard("Repository removed", `**${repo}** was removed.`));
    }

    if (action === "update-all") {
      await ctx.defer();
      const results = await api.updateAll();
      return ctx.reply(
        makeListCard(
          "Repository updates",
          results.map((entry) =>
            "error" in entry
              ? `🔴 **${entry.name}** — ${entry.error}`
              : `${entry.changed ? "🟢" : "⚪"} **${entry.name}** — ${entry.changed ? `${entry.modules.length} module(s) reloaded` : "already current"}`,
          ),
        ),
      );
    }

    throw new Error(`Unknown addons action: ${action}`);
  },
};
