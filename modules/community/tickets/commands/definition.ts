import type { CommandDefinition, ModuleServices } from "@lumi/module-kit";
import { type ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { Priorities } from "../constants.js";
import {
  categoryAdd,
  categoryEdit,
  categoryList,
  categoryRemove,
  setupPanel,
} from "./categories.js";
import { feedbackCommand, infoCommand, listCommand } from "./info.js";
import { blacklistCommand, tagCommand } from "./moderation.js";
import {
  CategoryNameLimit,
  ensureModule,
  guildIdOf,
  replyError,
} from "./shared.js";
import {
  addNote,
  changeMember,
  claimTicket,
  closeCurrentTicket,
  setPriority,
} from "./ticket.js";

const Command = new SlashCommandBuilder()
  .setName("ticket")
  .setDescription("Open and manage private support tickets")
  .addSubcommandGroup((group) =>
    group
      .setName("setup")
      .setDescription("Post and configure ticket panels")
      .addSubcommand((sub) =>
        sub
          .setName("panel")
          .setDescription("Post a ticket panel in a text channel")
          .addChannelOption((option) =>
            option
              .setName("channel")
              .setDescription("Channel to post the panel in")
              .setRequired(false),
          )
          .addStringOption((option) =>
            option
              .setName("title")
              .setDescription("Panel title")
              .setMaxLength(100)
              .setRequired(false),
          )
          .addStringOption((option) =>
            option
              .setName("description")
              .setDescription("Panel description")
              .setMaxLength(2000)
              .setRequired(false),
          )
          .addStringOption((option) =>
            option
              .setName("categories")
              .setDescription(
                "Comma-separated category names (default: all enabled)",
              )
              .setMaxLength(500)
              .setRequired(false),
          ),
      ),
  )
  .addSubcommandGroup((group) =>
    group
      .setName("category")
      .setDescription("Manage ticket categories")
      .addSubcommand((sub) =>
        sub
          .setName("add")
          .setDescription("Create a ticket category")
          .addStringOption((option) =>
            option
              .setName("name")
              .setDescription("Category name")
              .setRequired(true)
              .setMaxLength(CategoryNameLimit),
          )
          .addStringOption((option) =>
            option
              .setName("emoji")
              .setDescription("Category emoji")
              .setRequired(false)
              .setMaxLength(64),
          )
          .addStringOption((option) =>
            option
              .setName("description")
              .setDescription("Category description")
              .setRequired(false)
              .setMaxLength(500),
          )
          .addStringOption((option) =>
            option
              .setName("staff_roles")
              .setDescription("Comma-separated staff role IDs or mentions")
              .setRequired(false),
          )
          .addStringOption((option) =>
            option
              .setName("ping_roles")
              .setDescription("Comma-separated ping role IDs or mentions")
              .setRequired(false),
          )
          .addStringOption((option) =>
            option
              .setName("required_roles")
              .setDescription("Roles required to open this category")
              .setRequired(false),
          )
          .addStringOption((option) =>
            option
              .setName("opening_message")
              .setDescription("Message shown at the top of new tickets")
              .setRequired(false)
              .setMaxLength(2000),
          )
          .addIntegerOption((option) =>
            option
              .setName("cooldown_seconds")
              .setDescription("Per-user cooldown between tickets (0 disables)")
              .setRequired(false)
              .setMinValue(0)
              .setMaxValue(86400),
          )
          .addIntegerOption((option) =>
            option
              .setName("member_limit")
              .setDescription("Max open tickets per user in this category (0 disables)")
              .setRequired(false)
              .setMinValue(0)
              .setMaxValue(25),
          )
          .addIntegerOption((option) =>
            option
              .setName("total_limit")
              .setDescription("Max open tickets in this category (0 disables)")
              .setRequired(false)
              .setMinValue(0)
              .setMaxValue(500),
          )
          .addBooleanOption((option) =>
            option
              .setName("claiming_enabled")
              .setDescription("Whether staff can claim tickets")
              .setRequired(false),
          )
          .addBooleanOption((option) =>
            option
              .setName("feedback_enabled")
              .setDescription("Whether feedback is collected on close")
              .setRequired(false),
          )
          .addStringOption((option) =>
            option
              .setName("naming_template")
              .setDescription(
                "Thread name template: {user}, {username}, {id}, {category}, {number}",
              )
              .setRequired(false)
              .setMaxLength(100),
          )
          .addStringOption((option) =>
            option
              .setName("default_priority")
              .setDescription("Default ticket priority")
              .setRequired(false)
              .addChoices(
                ...Priorities.map((priority) => ({
                  name: priority,
                  value: priority,
                })),
              ),
          )
          .addStringOption((option) =>
            option
              .setName("questions")
              .setDescription("JSON array of up to 5 modal questions")
              .setRequired(false)
              .setMaxLength(4000),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("edit")
          .setDescription("Edit a ticket category")
          .addStringOption((option) =>
            option
              .setName("name")
              .setDescription("Current category name")
              .setRequired(true)
              .setMaxLength(CategoryNameLimit),
          )
          .addStringOption((option) =>
            option
              .setName("new_name")
              .setDescription("New category name")
              .setRequired(false)
              .setMaxLength(CategoryNameLimit),
          )
          .addStringOption((option) =>
            option
              .setName("emoji")
              .setDescription("Category emoji, or - to clear")
              .setRequired(false)
              .setMaxLength(64),
          )
          .addStringOption((option) =>
            option
              .setName("description")
              .setDescription("Category description, or - to clear")
              .setRequired(false)
              .setMaxLength(500),
          )
          .addStringOption((option) =>
            option
              .setName("staff_roles")
              .setDescription("Comma-separated staff role IDs, or - to clear")
              .setRequired(false),
          )
          .addStringOption((option) =>
            option
              .setName("ping_roles")
              .setDescription("Comma-separated ping role IDs, or - to clear")
              .setRequired(false),
          )
          .addStringOption((option) =>
            option
              .setName("required_roles")
              .setDescription("Roles required to open, or - to clear")
              .setRequired(false),
          )
          .addStringOption((option) =>
            option
              .setName("opening_message")
              .setDescription("Opening message, or - to clear")
              .setRequired(false)
              .setMaxLength(2000),
          )
          .addIntegerOption((option) =>
            option
              .setName("cooldown_seconds")
              .setDescription("Per-user cooldown between tickets (0 disables)")
              .setRequired(false)
              .setMinValue(0)
              .setMaxValue(86400),
          )
          .addIntegerOption((option) =>
            option
              .setName("member_limit")
              .setDescription("Max open tickets per user in this category (0 disables)")
              .setRequired(false)
              .setMinValue(0)
              .setMaxValue(25),
          )
          .addIntegerOption((option) =>
            option
              .setName("total_limit")
              .setDescription("Max open tickets in this category (0 disables)")
              .setRequired(false)
              .setMinValue(0)
              .setMaxValue(500),
          )
          .addBooleanOption((option) =>
            option
              .setName("claiming_enabled")
              .setDescription("Whether staff can claim tickets")
              .setRequired(false),
          )
          .addBooleanOption((option) =>
            option
              .setName("feedback_enabled")
              .setDescription("Whether feedback is collected on close")
              .setRequired(false),
          )
          .addStringOption((option) =>
            option
              .setName("naming_template")
              .setDescription("Thread name template")
              .setRequired(false)
              .setMaxLength(100),
          )
          .addStringOption((option) =>
            option
              .setName("default_priority")
              .setDescription("Default ticket priority")
              .setRequired(false)
              .addChoices(
                ...Priorities.map((priority) => ({
                  name: priority,
                  value: priority,
                })),
              ),
          )
          .addStringOption((option) =>
            option
              .setName("questions")
              .setDescription("JSON array of up to 5 modal questions")
              .setRequired(false)
              .setMaxLength(4000),
          )
          .addBooleanOption((option) =>
            option
              .setName("enabled")
              .setDescription("Whether the category is available")
              .setRequired(false),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("remove")
          .setDescription("Delete a ticket category")
          .addStringOption((option) =>
            option
              .setName("name")
              .setDescription("Category name")
              .setRequired(true)
              .setMaxLength(CategoryNameLimit),
          ),
      )
      .addSubcommand((sub) =>
        sub.setName("list").setDescription("List ticket categories"),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("close")
      .setDescription("Close this ticket and save a transcript")
      .addStringOption((option) =>
        option
          .setName("reason")
          .setDescription("Close reason")
          .setRequired(false)
          .setMaxLength(1000),
      ),
  )
  .addSubcommand((sub) =>
    sub.setName("claim").setDescription("Claim this ticket"),
  )
  .addSubcommand((sub) =>
    sub.setName("unclaim").setDescription("Release this ticket"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("priority")
      .setDescription("Set this ticket's priority")
      .addStringOption((option) =>
        option
          .setName("level")
          .setDescription("Priority level")
          .setRequired(true)
          .addChoices(
            ...Priorities.map((priority) => ({
              name: priority,
              value: priority,
            })),
          ),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("note")
      .setDescription("Add an internal staff note")
      .addStringOption((option) =>
        option
          .setName("content")
          .setDescription("Note content")
          .setRequired(true)
          .setMaxLength(2000),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setDescription("Add a member to this ticket thread")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("Member to add")
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setDescription("Remove a member from this ticket thread")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("Member to remove")
          .setRequired(true),
      ),
  )
  .addSubcommandGroup((group) =>
    group
      .setName("blacklist")
      .setDescription("Manage members who cannot open tickets")
      .addSubcommand((sub) =>
        sub
          .setName("add")
          .setDescription("Blacklist a member")
          .addUserOption((option) =>
            option
              .setName("user")
              .setDescription("Member to blacklist")
              .setRequired(true),
          )
          .addStringOption((option) =>
            option
              .setName("reason")
              .setDescription("Reason")
              .setRequired(false)
              .setMaxLength(500),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("remove")
          .setDescription("Remove a member from the blacklist")
          .addUserOption((option) =>
            option
              .setName("user")
              .setDescription("Member to unblacklist")
              .setRequired(true),
          ),
      )
      .addSubcommand((sub) =>
        sub.setName("list").setDescription("List blacklisted members"),
      ),
  )
  .addSubcommandGroup((group) =>
    group
      .setName("tag")
      .setDescription("Manage canned replies")
      .addSubcommand((sub) =>
        sub
          .setName("add")
          .setDescription("Create a canned reply")
          .addStringOption((option) =>
            option
              .setName("name")
              .setDescription("Tag name")
              .setRequired(true)
              .setMaxLength(50),
          )
          .addStringOption((option) =>
            option
              .setName("content")
              .setDescription("Reply content")
              .setRequired(true)
              .setMaxLength(2000),
          )
          .addStringOption((option) =>
            option
              .setName("regex")
              .setDescription("Regex that triggers this auto-tag reply")
              .setRequired(false)
              .setMaxLength(200),
          )
          .addBooleanOption((option) =>
            option
              .setName("auto_tag")
              .setDescription("Reply automatically when a message matches the regex")
              .setRequired(false),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("edit")
          .setDescription("Edit a canned reply")
          .addStringOption((option) =>
            option
              .setName("name")
              .setDescription("Tag name")
              .setRequired(true)
              .setMaxLength(50),
          )
          .addStringOption((option) =>
            option
              .setName("content")
              .setDescription("New reply content")
              .setRequired(false)
              .setMaxLength(2000),
          )
          .addStringOption((option) =>
            option
              .setName("regex")
              .setDescription("Auto-tag regex, or - to clear")
              .setRequired(false)
              .setMaxLength(200),
          )
          .addBooleanOption((option) =>
            option
              .setName("auto_tag")
              .setDescription("Reply automatically when a message matches the regex")
              .setRequired(false),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("remove")
          .setDescription("Delete a canned reply")
          .addStringOption((option) =>
            option
              .setName("name")
              .setDescription("Tag name")
              .setRequired(true)
              .setMaxLength(50),
          ),
      )
      .addSubcommand((sub) =>
        sub.setName("list").setDescription("List canned replies"),
      )
      .addSubcommand((sub) =>
        sub
          .setName("use")
          .setDescription("Post a canned reply in this ticket")
          .addStringOption((option) =>
            option
              .setName("name")
              .setDescription("Tag name")
              .setRequired(true)
              .setMaxLength(50),
          ),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("feedback")
      .setDescription("Rate a closed ticket")
      .addIntegerOption((option) =>
        option
          .setName("rating")
          .setDescription("Rating from 1 to 5")
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(5),
      )
      .addStringOption((option) =>
        option
          .setName("comment")
          .setDescription("Optional comment")
          .setRequired(false)
          .setMaxLength(1000),
      )
      .addStringOption((option) =>
        option
          .setName("ticket")
          .setDescription("Ticket ID (defaults to this thread's ticket)")
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("info")
      .setDescription("Show ticket details")
      .addStringOption((option) =>
        option
          .setName("ticket")
          .setDescription("Ticket ID (defaults to this thread's ticket)")
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("list")
      .setDescription("List tickets (staff only)")
      .addStringOption((option) =>
        option
          .setName("status")
          .setDescription("Which tickets to list")
          .setRequired(false)
          .addChoices(
            { name: "open", value: "open" },
            { name: "closed", value: "closed" },
            { name: "all", value: "all" },
          ),
      ),
  );

async function execute(
  interaction: ChatInputCommandInteraction,
  services: ModuleServices,
): Promise<void> {
  const guildId = await guildIdOf(interaction);
  if (!guildId) return;
  if (!(await ensureModule(interaction, services, guildId))) return;

  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand(false);

  if (group === "setup" && sub === "panel") {
    await setupPanel(interaction, services);
    return;
  }
  if (group === "category") {
    if (sub === "add") return categoryAdd(interaction, services);
    if (sub === "edit") return categoryEdit(interaction, services);
    if (sub === "remove") return categoryRemove(interaction, services);
    if (sub === "list") return categoryList(interaction, services);
  }
  if (group === "blacklist" && sub) {
    return blacklistCommand(interaction, services, sub);
  }
  if (group === "tag" && sub) {
    return tagCommand(interaction, services, sub);
  }

  switch (sub) {
    case "close":
      return closeCurrentTicket(interaction, services);
    case "claim":
      return claimTicket(interaction, services, false);
    case "unclaim":
      return claimTicket(interaction, services, true);
    case "priority":
      return setPriority(interaction, services);
    case "note":
      return addNote(interaction, services);
    case "add":
      return changeMember(interaction, services, true);
    case "remove":
      return changeMember(interaction, services, false);
    case "feedback":
      return feedbackCommand(interaction, services);
    case "info":
      return infoCommand(interaction, services);
    case "list":
      return listCommand(interaction, services);
    default:
      await replyError(
        interaction,
        "Unknown Command",
        "That ticket action is not available.",
      );
  }
}

export const ticketCommand: CommandDefinition = {
  data: Command,
  requiredPermit: "tickets.manage",
  async execute(interaction, services) {
    await execute(interaction, services);
  },
};
