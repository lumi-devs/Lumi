import type { ChatInputCommandInteraction, Message } from "discord.js";
import { LumiPermissionPrecondition } from "#lib/preconditions/LumiPermissionPrecondition.js";
import { permitSubject } from "#lib/permissions/subject.js";

declare module "@sapphire/framework" {
  interface Preconditions {
    Moderator: never;
  }
}

const DeniedMessage = "You need at least **Moderator** level to use this.";

export class ModeratorPrecondition extends LumiPermissionPrecondition {
  public override messageRun(message: Message) {
    const subject = permitSubject(message.guild, message.author.id, message.member, message.channelId);
    if (!subject) return this.outsideGuild();
    return this.checkPermit(subject, "mod.*", DeniedMessage);
  }

  public override chatInputRun(interaction: ChatInputCommandInteraction) {
    const subject = permitSubject(interaction.guild, interaction.user.id, interaction.member, interaction.channelId);
    if (!subject) return this.outsideGuild();
    return this.checkPermit(subject, "mod.*", DeniedMessage);
  }
}
