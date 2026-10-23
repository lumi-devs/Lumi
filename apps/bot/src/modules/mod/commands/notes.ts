import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  time,
  userMention,
} from "discord.js";
import type { CommandDef } from "@lumi/bot-kit";
import { makeErrorCard, makeInfoCard, makeListCard, makeSuccessCard } from "@lumi/ui";

export const notesCommand: CommandDef = {
  name: "notes",
  description: "Manage moderator notes on users.",
  module: "mod",
  guildOnly: true,
  prefix: true,
  permitNode: "mod.notes",
  requiredPermissions: PermissionFlagsBits.ModerateMembers,
  build: () =>
    new SlashCommandBuilder()
      .setName("notes")
      .setDescription("Manage moderator notes on users.")
      .addSubcommand((sub) =>
        sub
          .setName("list")
          .setDescription("List moderator notes on a user.")
          .addUserOption((option) =>
            option.setName("user").setDescription("Target user").setRequired(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("add")
          .setDescription("Add a note to a user.")
          .addUserOption((option) =>
            option.setName("user").setDescription("Target user").setRequired(true),
          )
          .addStringOption((option) =>
            option.setName("note").setDescription("Note text").setRequired(true).setMaxLength(1_000),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("delete")
          .setDescription("Delete a note by ID.")
          .addIntegerOption((option) =>
            option.setName("id").setDescription("Note ID").setRequired(true).setMinValue(1),
          ),
      ),
  async run(ctx) {
    const guild = ctx.guild;
    if (!guild) return ctx.reply(makeErrorCard("Server Only", "This command can only be used in a server."));

    const sub = ctx.getSubcommand();

    if (sub === "add") {
      const targetUser = await ctx.getUser("user");
      const text = await ctx.getString("note", { rest: true });
      if (!targetUser || !text) {
        return ctx.reply(makeErrorCard("Invalid Usage", "Specify a user and note content."));
      }

      const note = await ctx.services.db.moderation.createNote(
        guild.id,
        targetUser.id,
        ctx.user.id,
        text,
      );
      return ctx.reply(
        makeSuccessCard("Note Added", `Added note **#${note.id}** to ${userMention(targetUser.id)}.`),
      );
    }

    if (sub === "delete") {
      const noteId = await ctx.getInteger("id");
      if (!noteId) return ctx.reply(makeErrorCard("Invalid Usage", "Specify a note ID."));

      const deleted = await ctx.services.db.moderation.deleteNote(guild.id, noteId);
      return deleted
        ? ctx.reply(makeSuccessCard("Note Deleted", `Deleted note **#${noteId}**.`))
        : ctx.reply(makeErrorCard("Not Found", `Note **#${noteId}** was not found.`));
    }

    const targetUser = await ctx.getUser("user");
    if (!targetUser) {
      return ctx.reply(makeErrorCard("Missing User", "Specify a user to list notes for."));
    }

    const notes = await ctx.services.db.moderation.listNotes(guild.id, targetUser.id);
    if (notes.length === 0) {
      return ctx.reply(
        makeInfoCard("No Notes", `No moderator notes recorded for ${userMention(targetUser.id)}.`),
      );
    }

    return ctx.reply(
      makeListCard(
        `Mod Notes for ${targetUser.displayName}`,
        notes.map(
          (note) =>
            `**#${note.id}** • by ${userMention(note.authorId)} *(${time(note.createdAt, "R")})*\n> ${note.message}`,
        ),
      ),
    );
  },
};
