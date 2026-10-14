import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "#src/lib/commands/CommandDef.js";
import type { CommandContext } from "#src/lib/commands/Context.js";
import { isSnowflakeId } from "#src/lib/utilities/Snowflakes.js";

function targetId(raw: string): string | null {
  const id = raw.replace(/\D/g, "");
  return isSnowflakeId(id) ? id : null;
}

async function manage(
  ctx: CommandContext,
  kind: "block" | "allow",
  remove: boolean,
): Promise<void> {
  await ctx.defer();
  const raw = (await ctx.getString("user", { required: true }))!;
  const userId = targetId(raw);
  if (!userId) {
    await ctx.replyError("Invalid User", `\`${raw}\` is not a valid user ID.`);
    return;
  }
  const global = (await ctx.getBoolean("global")) ?? false;
  const reason = (await ctx.getString("reason")) ?? undefined;
  const guildId = global ? null : ctx.guild?.id ?? null;
  if (!global && !guildId) {
    await ctx.replyError("Guild Only", "Guild-scoped entries need a server.");
    return;
  }
  if (remove) {
    if (kind === "block") {
      await ctx.services.db.access.removeBlocklistEntry(userId, guildId);
    } else {
      await ctx.services.db.access.removeAllowEntry(userId, guildId);
    }
  } else if (kind === "block") {
    await ctx.services.db.access.addBlocklistEntry(
      userId,
      ctx.user.id,
      reason,
      guildId,
    );
  } else {
    await ctx.services.db.access.addAllowEntry(
      userId,
      ctx.user.id,
      reason,
      guildId,
    );
  }
  await ctx.replySuccess(
    remove ? "Entry Removed" : kind === "block" ? "User Blocked" : "User Allowed",
    `<@${userId}> ${remove ? "removed from" : "added to"} the ${global ? "global" : "server"} ${kind}list.`,
  );
}

async function list(ctx: CommandContext, kind: "block" | "allow"): Promise<void> {
  await ctx.defer();
  const global = (await ctx.getBoolean("global")) ?? false;
  const guildId = global ? null : ctx.guild?.id ?? null;
  const { entries, total } =
    kind === "block"
      ? await ctx.services.db.access.listBlocklist(guildId)
      : await ctx.services.db.access.listAllowlist(guildId);
  if (!entries.length) {
    await ctx.replySuccess(
      "List Empty",
      `No ${global ? "global" : "server"} ${kind}list entries.`,
    );
    return;
  }
  await ctx.replySuccess(
    `${kind === "block" ? "Blocked" : "Allowed"} Users (${total})`,
    entries
      .slice(0, 20)
      .map((e) => `<@${e.userId}> - ${e.reason ?? "no reason"}`)
      .join("\n"),
  );
}

export const accessDef: CommandDef = {
  name: "access",
  description: "Bot owner blocklist and allowlist management",
  botOwner: true,
  prefixEnabled: true,
  build: () =>
    new SlashCommandBuilder()
      .setName("access")
      .setDescription("Bot owner blocklist and allowlist management")
      .addSubcommand((s) =>
        s
          .setName("block")
          .setDescription("Block a user globally or in this server")
          .addStringOption((o) =>
            o.setName("user").setDescription("User ID").setRequired(true),
          )
          .addBooleanOption((o) =>
            o.setName("global").setDescription("Apply globally"),
          )
          .addStringOption((o) =>
            o.setName("reason").setDescription("Reason"),
          ),
      )
      .addSubcommand((s) =>
        s
          .setName("unblock")
          .setDescription("Remove a block entry")
          .addStringOption((o) =>
            o.setName("user").setDescription("User ID").setRequired(true),
          )
          .addBooleanOption((o) =>
            o.setName("global").setDescription("Apply globally"),
          ),
      )
      .addSubcommand((s) =>
        s
          .setName("allow")
          .setDescription("Allowlist a user globally or in this server")
          .addStringOption((o) =>
            o.setName("user").setDescription("User ID").setRequired(true),
          )
          .addBooleanOption((o) =>
            o.setName("global").setDescription("Apply globally"),
          )
          .addStringOption((o) =>
            o.setName("reason").setDescription("Reason"),
          ),
      )
      .addSubcommand((s) =>
        s
          .setName("unallow")
          .setDescription("Remove an allow entry")
          .addStringOption((o) =>
            o.setName("user").setDescription("User ID").setRequired(true),
          )
          .addBooleanOption((o) =>
            o.setName("global").setDescription("Apply globally"),
          ),
      )
      .addSubcommand((s) =>
        s
          .setName("list")
          .setDescription("List block or allow entries")
          .addStringOption((o) =>
            o
              .setName("kind")
              .setDescription("Which list")
              .setRequired(true)
              .addChoices(
                { name: "block", value: "block" },
                { name: "allow", value: "allow" },
              ),
          )
          .addBooleanOption((o) =>
            o.setName("global").setDescription("Apply globally"),
          ),
      ),
  handlers: {
    block: (ctx: CommandContext) => manage(ctx, "block", false),
    unblock: (ctx: CommandContext) => manage(ctx, "block", true),
    allow: (ctx: CommandContext) => manage(ctx, "allow", false),
    unallow: (ctx: CommandContext) => manage(ctx, "allow", true),
    list: async (ctx: CommandContext) => {
      const kind = (await ctx.getString("kind", { required: true }))!;
      await list(ctx, kind === "allow" ? "allow" : "block");
    },
  },
  defaultSub: "list",
};
