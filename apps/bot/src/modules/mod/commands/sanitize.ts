import { SlashCommandBuilder, userMention } from "discord.js";
import type { CommandDef } from "@lumi/bot-kit";
import { makeErrorCard, makeSuccessCard } from "@lumi/ui";
import { resolveMemberTarget } from "../services/target.ts";

const DehoistRegex = /^[\x21-\x40\x5B-\x60\x7B-\x7E\s]+/u;

function sanitizeName(name: string): string {
  const dehoisted = name.replace(DehoistRegex, "").trim();
  return dehoisted.length >= 2 ? dehoisted : "Sanitized User";
}

export const sanitizeCommand: CommandDef = {
  name: "sanitize",
  description: "Remove hoisting characters from a member's nickname.",
  module: "mod",
  guildOnly: true,
  prefix: true,
  permitNode: "mod.*",
  build: () =>
    new SlashCommandBuilder()
      .setName("sanitize")
      .setDescription("Remove hoisting characters from a member's nickname.")
      .addUserOption((option) =>
        option.setName("user").setDescription("Member to sanitize").setRequired(true),
      ),
  async run(ctx) {
    const guild = ctx.guild;
    if (!guild) return ctx.reply(makeErrorCard("Server Only", "This command can only be used in a server."));

    const resolved = await resolveMemberTarget(ctx);
    if (resolved.error) return ctx.reply(resolved.error);

    const { member } = resolved.target;
    const before = member.nickname ?? member.user.username;
    const after = sanitizeName(before);

    if (after === before) {
      return ctx.reply(
        makeErrorCard(
          "Nothing to Sanitize",
          `${userMention(member.id)}'s nickname has no hoisting characters.`,
        ),
      );
    }

    try {
      await member.setNickname(after, "Sanitize: removed hoisting characters");
    } catch (error) {
      return ctx.reply(
        makeErrorCard(
          "Sanitize Failed",
          error instanceof Error ? error.message : "Discord rejected the nickname change.",
        ),
      );
    }

    return ctx.reply(
      makeSuccessCard(
        "Nickname Sanitized",
        `Changed ${userMention(member.id)}'s nickname from \`${before}\` to \`${after}\`.`,
      ),
    );
  },
};
