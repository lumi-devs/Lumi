import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "@lumi/bot-kit";
import { makeListCard, makeSuccessCard } from "@lumi/ui";

const icons = { loaded: "🟢", disabled: "⚪", failed: "🔴" } as const;

export const modules: CommandDef = {
  name: "modules",
  description: "List, enable, disable, or reload modules.",
  module: null,
  ownerOnly: true,
  build: () =>
    new SlashCommandBuilder()
      .setName("modules")
      .setDescription("Manage modules")
      .addStringOption((option) =>
        option
          .setName("action")
          .setDescription("What to do")
          .setRequired(true)
          .addChoices(
            { name: "list", value: "list" },
            { name: "enable", value: "enable" },
            { name: "disable", value: "disable" },
            { name: "reload", value: "reload" },
          ),
      )
      .addStringOption((option) => option.setName("name").setDescription("Module name"))
      .addStringOption((option) =>
        option
          .setName("scope")
          .setDescription("Where to apply enable/disable")
          .addChoices({ name: "global", value: "global" }, { name: "guild", value: "guild" }),
      ),
  async run(ctx) {
    const action = (await ctx.getString("action")) ?? "list";
    const name = await ctx.getString("name");
    const scope = (await ctx.getString("scope")) ?? "global";

    if (action === "list") {
      const statuses = ctx.services.moduleControl.status();
      if (statuses.length === 0) return ctx.replyInfo("Modules", "No modules discovered.");
      return ctx.reply(
        makeListCard(
          "Modules",
          statuses.map(
            (status) =>
              `${icons[status.state]} **${status.name}** \`v${status.version}\` · ${status.origin}${status.error ? `\n-# ${status.error}` : ""}`,
          ),
        ),
      );
    }

    if (!name) throw new Error("A module name is required for this action.");
    if (action === "reload") {
      await ctx.defer();
      await ctx.services.moduleControl.reload(name);
      return ctx.reply(makeSuccessCard("Module reloaded", `**${name}** is live again.`));
    }

    const enabled = action === "enable";
    await ctx.defer();
    if (scope === "guild") {
      if (!ctx.guildId) throw new Error("Guild scope needs a server.");
      await ctx.services.db.modules.setGuild(ctx.guildId, name, enabled);
    } else {
      await ctx.services.moduleControl.setEnabled(name, enabled);
    }
    return ctx.reply(
      makeSuccessCard(
        enabled ? "Module enabled" : "Module disabled",
        `**${name}** is now ${enabled ? "enabled" : "disabled"} for ${scope === "guild" ? "this server" : "everyone"}.`,
      ),
    );
  },
};
