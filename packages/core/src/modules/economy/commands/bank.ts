import { userMention } from "@discordjs/formatters";
import { ApplyOptions } from "@sapphire/decorators";
import type { ApplicationCommandRegistry } from "@sapphire/framework";
import { BaseSubcommand, type CommandContext } from "#lib/commands.js";
import { BankService } from "../services/BankService.js";
import { formatAmount, getEconomyConfig } from "../index.js";
import { reportEconomyError } from "../lib/respond.js";

type Vault = "wallet" | "bank";

function vaultChoices() {
  return [
    { name: "Wallet", value: "wallet" },
    { name: "Bank", value: "bank" },
  ] as const;
}

@ApplyOptions<BaseSubcommand.Options>({
  name: "bank",
  description: "Move currency between wallet and bank; staff can adjust balances.",
  preconditions: ["GuildOnly", "ModuleEnabled"],
  module: "economy",
  prefixEnabled: true,
  cooldownLimit: 3,
  cooldownDelay: 5000,
  subcommands: [
    { name: "deposit", run: "deposit" },
    { name: "withdraw", run: "withdraw" },
    { name: "set", run: "setBalance" },
    { name: "add", run: "addBalance" },
    { name: "remove", run: "removeBalance" },
  ],
})
export class BankCommand extends BaseSubcommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .addSubcommand((sub) =>
          sub
            .setName("deposit")
            .setDescription("Move currency from wallet to bank.")
            .addIntegerOption((opt) =>
              opt
                .setName("amount")
                .setDescription("How much to deposit.")
                .setMinValue(1)
                .setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("withdraw")
            .setDescription("Move currency from bank to wallet.")
            .addIntegerOption((opt) =>
              opt
                .setName("amount")
                .setDescription("How much to withdraw.")
                .setMinValue(1)
                .setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("set")
            .setDescription("Set a member's balance (staff only).")
            .addUserOption((opt) =>
              opt
                .setName("user")
                .setDescription("Whose balance to set.")
                .setRequired(true),
            )
            .addIntegerOption((opt) =>
              opt
                .setName("amount")
                .setDescription("The new balance.")
                .setMinValue(0)
                .setRequired(true),
            )
            .addStringOption((opt) =>
              opt
                .setName("vault")
                .setDescription("Which balance to set.")
                .addChoices(...vaultChoices())
                .setRequired(false),
            )
            .addStringOption((opt) =>
              opt
                .setName("reason")
                .setDescription("Why the balance is changed.")
                .setMaxLength(200)
                .setRequired(false),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("add")
            .setDescription("Grant currency to a member (staff only).")
            .addUserOption((opt) =>
              opt
                .setName("user")
                .setDescription("Who receives the currency.")
                .setRequired(true),
            )
            .addIntegerOption((opt) =>
              opt
                .setName("amount")
                .setDescription("How much to add.")
                .setMinValue(1)
                .setRequired(true),
            )
            .addStringOption((opt) =>
              opt
                .setName("vault")
                .setDescription("Which balance to credit.")
                .addChoices(...vaultChoices())
                .setRequired(false),
            )
            .addStringOption((opt) =>
              opt
                .setName("reason")
                .setDescription("Why the currency is granted.")
                .setMaxLength(200)
                .setRequired(false),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("remove")
            .setDescription("Take currency from a member (staff only).")
            .addUserOption((opt) =>
              opt
                .setName("user")
                .setDescription("Who loses the currency.")
                .setRequired(true),
            )
            .addIntegerOption((opt) =>
              opt
                .setName("amount")
                .setDescription("How much to remove.")
                .setMinValue(1)
                .setRequired(true),
            )
            .addStringOption((opt) =>
              opt
                .setName("vault")
                .setDescription("Which balance to debit.")
                .addChoices(...vaultChoices())
                .setRequired(false),
            )
            .addStringOption((opt) =>
              opt
                .setName("reason")
                .setDescription("Why the currency is removed.")
                .setMaxLength(200)
                .setRequired(false),
            ),
        ),
    );
  }

  public async deposit(ctx: CommandContext): Promise<void> {
    const guildId = ctx.guildId!;
    const config = await getEconomyConfig(guildId);
    const amount = await ctx.getInteger("amount", { required: true });
    try {
      const balance = await new BankService().deposit(
        guildId,
        ctx.user.id,
        amount!,
        config,
      );
      await ctx.replySuccess(
        "Deposited",
        `Moved **${formatAmount(config, amount!)}** to your bank.\nWallet: **${formatAmount(config, balance.wallet)}** · Bank: **${formatAmount(config, balance.bank)}**`,
        { ephemeral: false },
      );
    } catch (err) {
      await reportEconomyError(ctx, err);
    }
  }

  public async withdraw(ctx: CommandContext): Promise<void> {
    const guildId = ctx.guildId!;
    const config = await getEconomyConfig(guildId);
    const amount = await ctx.getInteger("amount", { required: true });
    try {
      const balance = await new BankService().withdraw(
        guildId,
        ctx.user.id,
        amount!,
        config,
      );
      await ctx.replySuccess(
        "Withdrawn",
        `Moved **${formatAmount(config, amount!)}** to your wallet.\nWallet: **${formatAmount(config, balance.wallet)}** · Bank: **${formatAmount(config, balance.bank)}**`,
        { ephemeral: false },
      );
    } catch (err) {
      await reportEconomyError(ctx, err);
    }
  }

  private async adjust(
    ctx: CommandContext,
    operation: "add" | "remove" | "set",
    verb: string,
  ): Promise<void> {
    await ctx.checkPermit("economy.admin");
    const guildId = ctx.guildId!;
    const config = await getEconomyConfig(guildId);
    const target = await ctx.getUser("user", { required: true });
    const amount = await ctx.getInteger("amount", { required: true });
    const vault = ((await ctx.getString("vault")) ?? "wallet") as Vault;
    const reason = (await ctx.getString("reason")) ?? "no reason given";
    try {
      const balance = await new BankService().adjust(
        guildId,
        target!.id,
        operation,
        amount!,
        vault === "bank" ? "bank" : "wallet",
        reason,
        ctx.user.id,
        config,
      );
      await ctx.replySuccess(
        `Balance ${verb}`,
        `${verb === "set" ? "Set" : verb === "add" ? "Added to" : "Removed from"} ${userMention(target!.id)}'s ${vault} ${operation === "set" ? `to **${formatAmount(config, amount!)}**` : `**${formatAmount(config, amount!)}**`} (${reason}).\nNew total: **${formatAmount(config, balance.total)}**`,
        { ephemeral: false },
      );
    } catch (err) {
      await reportEconomyError(ctx, err);
    }
  }

  public async setBalance(ctx: CommandContext): Promise<void> {
    await this.adjust(ctx, "set", "set");
  }

  public async addBalance(ctx: CommandContext): Promise<void> {
    await this.adjust(ctx, "add", "add");
  }

  public async removeBalance(ctx: CommandContext): Promise<void> {
    await this.adjust(ctx, "remove", "remove");
  }
}
