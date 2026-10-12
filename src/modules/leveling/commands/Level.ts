import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "#src/lib/commands/CommandDef.js";
import type { CommandContext } from "#src/lib/commands/Context.js";
import { getLevelingConfig } from "#src/modules/leveling/Config.js";
import {
  LevelError,
  LevelService,
} from "#src/modules/leveling/services/LevelService.js";

type AdjustOp = "add" | "remove";
type AdjustKind = "xp" | "level";

async function adjust(ctx: CommandContext, op: AdjustOp): Promise<void> {
  const guildId = ctx.guildId!;
  const config = await getLevelingConfig(ctx.services, guildId);
  const target = await ctx.getUser("user", { required: true });
  const kind = ((await ctx.getString("kind", { required: true })) ??
    "xp") as AdjustKind;
  if (kind !== "xp" && kind !== "level") {
    throw new LevelError("InvalidAmount", 'Kind must be "xp" or "level".');
  }
  const amount = (await ctx.getInteger("amount", { required: true }))!;
  const service = new LevelService();
  try {
    const account =
      kind === "xp"
        ? await service.adjustXp(
            guildId,
            target!.id,
            op === "add" ? amount : -amount,
            config,
          )
        : await service.adjustLevels(
            guildId,
            target!.id,
            op === "add" ? amount : -amount,
            config,
          );
    const unit = kind === "xp" ? "XP" : "Levels";
    await ctx.replySuccess(
      op === "add" ? `${unit} Granted` : `${unit} Removed`,
      `${target!.username} is now level **${account.level}** with **${account.xp}** XP.`,
      { ephemeral: false },
    );
  } catch (err) {
    if (err instanceof LevelError) {
      await ctx.replyError("Level Update Failed", err.message);
      return;
    }
    throw err;
  }
}

async function set(ctx: CommandContext): Promise<void> {
  const guildId = ctx.guildId!;
  const config = await getLevelingConfig(ctx.services, guildId);
  const target = await ctx.getUser("user", { required: true });
  const level = (await ctx.getInteger("level", { required: true }))!;
  const xp = (await ctx.getInteger("xp")) ?? 0;
  try {
    const account = await new LevelService().setLevel(
      guildId,
      target!.id,
      level,
      xp,
      config,
    );
    await ctx.replySuccess(
      "Level Updated",
      `${target!.username} is now level **${account.level}** with **${account.xp}** XP.`,
      { ephemeral: false },
    );
  } catch (err) {
    if (err instanceof LevelError) {
      await ctx.replyError("Level Update Failed", err.message);
      return;
    }
    throw err;
  }
}

export const levelDef: CommandDef = {
  name: "level",
  module: "leveling",
  description: "Adjust member XP and levels (staff only).",
  guildOnly: true,
  requiredPermit: "leveling.admin",
  prefixEnabled: true,
  cooldownMs: 3000,
  build: () => {
    return new SlashCommandBuilder()
      .setName("level")
      .setDescription("Adjust member XP and levels (staff only).")
        .addSubcommand((sub) =>
          sub
            .setName("add")
            .setDescription("Grant XP or levels to a member (staff only).")
            .addUserOption((opt) =>
              opt
                .setName("user")
                .setDescription("Who receives it.")
                .setRequired(true),
            )
            .addStringOption((opt) =>
              opt
                .setName("kind")
                .setDescription("Grant XP or whole levels.")
                .addChoices(
                  { name: "XP", value: "xp" },
                  { name: "Levels", value: "level" },
                )
                .setRequired(true),
            )
            .addIntegerOption((opt) =>
              opt
                .setName("amount")
                .setDescription("How much to grant.")
                .setMinValue(1)
                .setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("remove")
            .setDescription("Take XP or levels from a member (staff only).")
            .addUserOption((opt) =>
              opt
                .setName("user")
                .setDescription("Who loses it.")
                .setRequired(true),
            )
            .addStringOption((opt) =>
              opt
                .setName("kind")
                .setDescription("Remove XP or whole levels.")
                .addChoices(
                  { name: "XP", value: "xp" },
                  { name: "Levels", value: "level" },
                )
                .setRequired(true),
            )
            .addIntegerOption((opt) =>
              opt
                .setName("amount")
                .setDescription("How much to remove.")
                .setMinValue(1)
                .setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("set")
            .setDescription("Set a member's level and XP (staff only).")
            .addUserOption((opt) =>
              opt
                .setName("user")
                .setDescription("Whose level to set.")
                .setRequired(true),
            )
            .addIntegerOption((opt) =>
              opt
                .setName("level")
                .setDescription("The new level.")
                .setMinValue(1)
                .setRequired(true),
            )
            .addIntegerOption((opt) =>
              opt
                .setName("xp")
                .setDescription("Progress toward the next level.")
                .setMinValue(0)
                .setRequired(false),
            ),
        );
  },
  handlers: {
    add: async (ctx: CommandContext) => {
      await adjust(ctx, "add");
    },
    remove: async (ctx: CommandContext) => {
      await adjust(ctx, "remove");
    },
    set: async (ctx: CommandContext) => {
      await set(ctx);
    },
  },
};
