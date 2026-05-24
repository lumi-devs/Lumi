import { ApplyOptions } from "@sapphire/decorators";
import { Args, Command } from "@sapphire/framework";
import {
  Message,
  PermissionFlagsBits,
  TextChannel,
  type ButtonInteraction,
  ComponentType,
  ButtonStyle,
  Collection,
} from "discord.js";
import { ActionRowBuilder, ButtonBuilder } from "@discordjs/builders";
import {
  makeErrorCard,
  makeSuccessCard,
  makeWarningCard,
} from "#utilities/cards.js";

@ApplyOptions<Command.Options>({
  name: "purge",
  description: "Bulk delete messages in a channel.",
  preconditions: ["GuildOnly"],
  requiredUserPermissions: [PermissionFlagsBits.ManageMessages],
  requiredClientPermissions: [PermissionFlagsBits.ManageMessages],
})
export class PurgeCommand extends Command {
  public override async messageRun(message: Message, args: Args) {
    const amountResult = await args.pickResult("integer");

    if (amountResult.isErr()) {
      await message.reply({
        ...makeErrorCard(
          "Invalid Amount",
          "Please provide a number between 1 and 1000.",
        ),
        allowedMentions: {},
      });
      return;
    }

    const amount = amountResult.unwrap();

    if (amount <= 0 || amount > 1000) {
      await message.reply({
        ...makeErrorCard(
          "Invalid Amount",
          "Please provide a number between 1 and 1000.",
        ),
        allowedMentions: {},
      });
      return;
    }

    const channel = message.channel as TextChannel;
    let prompt: Message;

    // Delete the trigger command message immediately to keep the channel clean and prevent trigger collisions
    await message.delete().catch(() => {});

    if (amount > 50) {
      const res = await this.promptForConfirmation(
        channel,
        message.author.id,
        amount,
      );
      if (!res.confirmed) return;
      prompt = res.prompt;
    } else {
      prompt = await channel.send({
        ...makeSuccessCard(
          "Purging...",
          `Initiating deletion of ${amount} messages.`,
        ),
        allowedMentions: {},
      });
    }

    // Run the purge asynchronously in the background
    void this.executePurge(channel, amount, prompt);
  }

  private async executePurge(
    channel: TextChannel,
    amount: number,
    prompt: Message,
  ) {
    let deletedCount = 0;
    let remaining = amount;
    let lastMessageId: string | undefined = undefined;

    const safeBulkDelete = async (msgs: Message[]): Promise<number> => {
      if (msgs.length === 0) return 0;
      if (msgs.length <= 2) {
        let count = 0;
        for (const m of msgs) {
          const success = await m
            .delete()
            .then(() => true)
            .catch((err: any) => err?.code === 10008);
          if (success) count++;
        }
        return count;
      }
      try {
        const res = await channel.bulkDelete(msgs, true);
        return res.size;
      } catch (err: any) {
        if (err?.code === 10008) {
          this.container.logger.debug(
            `[Purge] Bulk delete of ${msgs.length} messages failed with 10008 (Unknown Message). Splitting chunk...`,
          );
          const mid = Math.floor(msgs.length / 2);
          const left = msgs.slice(0, mid);
          const right = msgs.slice(mid);
          const leftDeleted = await safeBulkDelete(left);
          const rightDeleted = await safeBulkDelete(right);
          return leftDeleted + rightDeleted;
        }
        throw err;
      }
    };

    try {
      while (remaining > 0) {
        const limit = Math.min(remaining, 100);

        const fetchOptions: any = {
          limit,
        };
        if (lastMessageId) {
          fetchOptions.before = lastMessageId;
        }

        // Fetch message batch using pagination to avoid API replication lag
        const messages = (await channel.messages
          .fetch(fetchOptions)
          .catch(() => null)) as Collection<string, Message> | null;
        if (!messages || messages.size === 0) break;

        // Track the oldest message in this batch to use as "before" in the next pass
        const oldestMessage = messages.last();
        if (oldestMessage) {
          lastMessageId = oldestMessage.id;
        }

        const now = Date.now();
        const fourteenDaysAgo = now - 14 * 24 * 60 * 60 * 1000;

        const youngMessages: Message[] = [];
        const oldMessages: Message[] = [];

        for (const msg of messages.values()) {
          // Skip the status message itself to avoid deleting our status card too early
          if (msg.id === prompt.id) continue;

          if (msg.createdTimestamp > fourteenDaysAgo) {
            youngMessages.push(msg);
          } else {
            oldMessages.push(msg);
          }
        }

        // 1. Bulk delete messages under 14 days old
        if (youngMessages.length > 0) {
          try {
            const numDeleted = await safeBulkDelete(youngMessages);
            deletedCount += numDeleted;
            remaining -= youngMessages.length;
          } catch (err: any) {
            this.container.logger.error(
              "[Purge] safeBulkDelete failed, falling back to individual slow deletions:",
              err,
            );
            oldMessages.push(...youngMessages);
          }
        }

        // 2. Individually delete messages over 14 days old (Throttled)
        if (oldMessages.length > 0) {
          for (const msg of oldMessages) {
            const success = await msg
              .delete()
              .then(() => true)
              .catch((err: any) => {
                if (err?.code === 10008) {
                  // Message was already deleted, count as success!
                  return true;
                }
                this.container.logger.error(
                  `[Purge] Individual delete failed for message ${msg.id}:`,
                  err,
                );
                return false;
              });

            if (success) {
              deletedCount++;
              remaining--;
            }
            // Sleep for 1.2 seconds to stay strictly within rate limits (5 deletes / 5 seconds)
            await new Promise((resolve) => setTimeout(resolve, 1200));
          }
        }

        // Break if no messages were found/processed to prevent infinite loop
        if (youngMessages.length === 0 && oldMessages.length === 0) {
          break;
        }
      }

      // Deletion complete — clean up status and send success confirmation card
      await prompt.delete().catch(() => {});
      const completedCard = await channel.send({
        ...makeSuccessCard(
          "Purge Complete",
          `✅ Deleted **${deletedCount}** messages.`,
        ),
        allowedMentions: {},
      });
      setTimeout(() => completedCard.delete().catch(() => {}), 5000);
    } catch (err: unknown) {
      this.container.logger.error(
        "[Purge] Background purge execution failed:",
        err,
      );
      await prompt.delete().catch(() => {});
    }
  }

  private async promptForConfirmation(
    channel: TextChannel,
    authorId: string,
    amount: number,
  ): Promise<{ prompt: Message; confirmed: boolean }> {
    const actionRows = [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("purge-confirm")
          .setLabel("Confirm")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId("purge-cancel")
          .setLabel("Cancel")
          .setStyle(ButtonStyle.Secondary),
      ),
    ];

    const prompt = await channel.send({
      ...makeWarningCard(
        "Confirmation Required",
        `Are you sure you want to delete the last ${amount} messages?`,
        { actionRows: actionRows as any },
      ),
      allowedMentions: {},
    });

    try {
      const filter = (i: ButtonInteraction) => i.user.id === authorId;
      const confirmation = await prompt.awaitMessageComponent({
        filter,
        componentType: ComponentType.Button,
        time: 15_000,
      });

      if (confirmation.customId === "purge-confirm") {
        await confirmation.update({
          ...makeSuccessCard(
            "Purging...",
            `Proceeding with deletion of ${amount} messages.`,
          ),
        });
        return { prompt, confirmed: true };
      }

      await confirmation.update({
        ...makeErrorCard(
          "Purge Cancelled",
          "The purge operation was cancelled.",
        ),
      });
      setTimeout(() => confirmation.message.delete().catch(() => {}), 5000);
      return { prompt, confirmed: false };
    } catch (e) {
      await prompt.edit({
        ...makeErrorCard(
          "Purge Cancelled",
          "The confirmation request timed out.",
        ),
      });
      setTimeout(() => prompt.delete().catch(() => {}), 5000);
      return { prompt, confirmed: false };
    }
  }
}
