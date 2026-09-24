import type { ChatInputCommandInteraction, Message } from "discord.js";
import { PermitPrecondition } from "#lib/permissions/PermitPrecondition.js";
import { permitSubject } from "#lib/permissions/subject.js";

declare module "@sapphire/framework" {
  interface Preconditions {
    Administrator: never;
  }
}

const DeniedMessage = "You need at least **Administrator** level to use this.";

export class AdministratorPrecondition extends PermitPrecondition {
  public override messageRun(message: Message) {
    const subject = permitSubject(message.guild, message.author.id, message.member, message.channelId);
    if (!subject) return this.outsideGuild();
    return this.checkPermit(subject, "admin.*", DeniedMessage);
  }

  public override chatInputRun(interaction: ChatInputCommandInteraction) {
    const subject = permitSubject(interaction.guild, interaction.user.id, interaction.member, interaction.channelId);
    if (!subject) return this.outsideGuild();
    return this.checkPermit(subject, "admin.*", DeniedMessage);
  }
}
