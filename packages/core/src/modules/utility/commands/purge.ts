import { ApplyOptions } from "@sapphire/decorators";
import type { Args } from "@sapphire/framework";
import { BaseCommand } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions/index.js";
import {
  Message,
  PermissionFlagsBits,
  type GuildTextBasedChannel,
  type ButtonInteraction,
  type FetchMessagesOptions,
  ComponentType,
  ButtonStyle,
  Collection,
} from "discord.js";
import { ActionRowBuilder, ButtonBuilder } from "@discordjs/builders";
import {
  makeErrorCard,
  makeSuccessCard,
  makeWarningCard,
} from "#lib/utilities/cards.js";
import { logError, errorCode } from "#lib/utilities/errors.js";
import { deleteMessageLater } from "#lib/utilities/temporary-message.js";

@ApplyOptions<BaseCommand.Options>({
  name: "purge",
  description: "Bulk delete messages in a channel.",
  preconditions: ["GuildOnly"],
  permissionLevel: PermissionLevel.MOD,
  requiredClientPermissions: [PermissionFlagsBits.ManageMessages],
})
export class PurgeCommand extends BaseCommand {
  public override async messageRun(message: Message, args: Args) {
    const amountResult = await args.pickResult("integer");
    const amount = amountResult.isOk() ? amountResult.unwrap() : NaN;

    if (Number.isNaN(amount) || amount <= 0 || amount > 1000) {
      await message.reply({
        ...makeErrorCard(
          "Invalid Amount",
          "Please provide a number between 1 and 1000.",
        ),
        allowedMentions: {},
      });
      return;
    }

    const channel = message.channel as GuildTextBasedChannel;
    let prompt: Message;

    await message
      .delete()
      .catch((err: unknown) =>
        logError("Purge: Failed to delete trigger message", err),
      );

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

    void this.executePurge(channel, amount, prompt);
  }

  private async executePurge(
    channel: GuildTextBasedChannel,
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
            .catch((err: unknown) => errorCode(err) === 10008);
          if (success) count++;
        }
        return count;
      }
      try {
        const res = await channel.bulkDelete(msgs, true);
        return res.size;
      } catch (err: unknown) {
        if (errorCode(err) === 10008) {
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

        const fetchOptions: FetchMessagesOptions = { limit };
        if (lastMessageId) fetchOptions.before = lastMessageId;

        const messages = (await channel.messages
          .fetch(fetchOptions)
          .catch(() => null)) as Collection<string, Message> | null;
        if (!messages || messages.size === 0) break;

        const oldestMessage = messages.last();
        if (oldestMessage) {
          lastMessageId = oldestMessage.id;
        }

        const now = Date.now();
        const fourteenDaysAgo = now - 14 * 24 * 60 * 60 * 1000;

        const youngMessages: Message[] = [];
        const oldMessages: Message[] = [];

        for (const msg of messages.values()) {
          if (msg.id === prompt.id) continue;

          if (msg.createdTimestamp > fourteenDaysAgo) {
            youngMessages.push(msg);
          } else {
            oldMessages.push(msg);
          }
        }

        if (youngMessages.length > 0) {
          try {
            const numDeleted = await safeBulkDelete(youngMessages);
            deletedCount += numDeleted;
            remaining -= numDeleted;
          } catch (err: unknown) {
            this.container.logger.error(
              "[Purge] safeBulkDelete failed, falling back to individual slow deletions:",
              err,
            );
            oldMessages.push(...youngMessages);
          }
        }

        if (oldMessages.length > 0) {
          for (const msg of oldMessages) {
            const success = await msg
              .delete()
              .then(() => true)
              .catch((err: unknown) => {
                if (errorCode(err) === 10008) {
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
          }
        }

        if (youngMessages.length === 0 && oldMessages.length === 0) {
          break;
        }
      }

      await prompt
        .delete()
        .catch((err: unknown) =>
          logError("Purge: Failed to delete prompt", err),
        );
      const completedCard = await channel.send({
        ...makeSuccessCard(
          "Purge Complete",
          `✅ Deleted **${deletedCount}** messages.`,
        ),
        allowedMentions: {},
      });
      deleteMessageLater(
        completedCard,
        undefined,
        "Purge: delete completedCard",
      );
    } catch (err: unknown) {
      this.container.logger.error(
        "[Purge] Background purge execution failed:",
        err,
      );
      await prompt
        .delete()
        .catch((err: unknown) =>
          logError("Purge: Failed to delete prompt", err),
        );
    }
  }

  private async promptForConfirmation(
    channel: GuildTextBasedChannel,
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
        { actionRows },
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
      deleteMessageLater(
        confirmation.message,
        undefined,
        "Purge: delete confirmation message",
      );
      return { prompt, confirmed: false };
    } catch (e) {
      await prompt.edit({
        ...makeErrorCard(
          "Purge Cancelled",
          "The confirmation request timed out.",
        ),
      });
      deleteMessageLater(
        prompt,
        undefined,
        "Purge: delete prompt after timeout",
      );
      return { prompt, confirmed: false };
    }
  }
}
