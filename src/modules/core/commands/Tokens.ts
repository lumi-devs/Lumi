import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "#src/lib/commands/CommandDef.js";
import { CommandContext } from "#src/lib/commands/Context.js";

const MaxServiceLength = 64;

const MaxTokenLength = 2000;

function invalidService(service: string): boolean {
  return service.length === 0 || service.length > MaxServiceLength;
}

export const tokensDef: CommandDef = {
  name: "tokens",
  description: "Manage shared third-party API tokens",
  guildOnly: true,
  botOwner: true,
  prefixEnabled: true,
  build: () =>
    new SlashCommandBuilder()
      .setName("tokens")
      .setDescription("Manage shared third-party API tokens")
      .addSubcommand((s) =>
        s
          .setName("set")
          .setDescription("Create or replace a shared API token")
          .addStringOption((o) =>
            o
              .setName("service")
              .setDescription("Service name, e.g. weather")
              .setRequired(true),
          )
          .addStringOption((o) =>
            o
              .setName("token")
              .setDescription("Token value (never echoed back)")
              .setRequired(true),
          ),
      )
      .addSubcommand((s) =>
        s
          .setName("remove")
          .setDescription("Delete a shared API token")
          .addStringOption((o) =>
            o
              .setName("service")
              .setDescription("Service name to delete")
              .setRequired(true),
          ),
      ),
  handlers: {
  "set": async (ctx: CommandContext) => {
    await ctx.defer();
    const service = ((await ctx.getString("service", { required: true }))!).trim();
    const token = ((await ctx.getString("token", { required: true }))!).trim();
    if (invalidService(service)) {
      await ctx.replyError(
        `❌ Invalid Service`,
        `Service must be 1-${MaxServiceLength} characters.`,
      );
      return;
    }
    if (token.length === 0 || token.length > MaxTokenLength) {
      await ctx.replyError(
        `❌ Invalid Token`,
        `Token must be 1-${MaxTokenLength} characters.`,
      );
      return;
    }
    await ctx.services.db.sharedTokens.setToken(service, token);
    ctx.services.logger.info(
      `[Tokens] 🔑 Shared token set for service ${service} by ${ctx.user.tag}`,
    );
    await ctx.replySuccess(
      `🔑 Token Saved`,
      `Shared token for **${service}** was saved. Values are never displayed back.`,
    );
  },
  "remove": async (ctx: CommandContext) => {
    await ctx.defer();
    const service = ((await ctx.getString("service", { required: true }))!).trim();
    if (invalidService(service)) {
      await ctx.replyError(
        `❌ Invalid Service`,
        `Service must be 1-${MaxServiceLength} characters.`,
      );
      return;
    }
    const deleted = await ctx.services.db.sharedTokens.deleteToken(service);
    if (!deleted) {
      await ctx.replyError(
        `❌ Not Found`,
        `No shared token is stored for **${service}**.`,
      );
      return;
    }
    ctx.services.logger.info(
      `[Tokens] 🗑️ Shared token removed for service ${service} by ${ctx.user.tag}`,
    );
    await ctx.replySuccess(
      `🗑️ Token Removed`,
      `Shared token for **${service}** was deleted.`,
    );
  },
  },
};
