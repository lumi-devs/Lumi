import { container, type Command } from "@sapphire/framework";
import type {
  ChatInputCommandInteraction,
  ContextMenuCommandInteraction,
  Message,
} from "discord.js";
import type { BaseCommand } from "#lib/commands.js";
import { PermitPrecondition } from "#lib/permissions/PermitPrecondition.js";
import { permitSubject } from "#lib/permissions/subject.js";

declare module "@sapphire/framework" {
  interface Preconditions {
    RequirePermit: never;
  }
}

const deniedMessage = (node: string) =>
  `You lack the required permit (\`${node}\`) to use this.`;

export class RequirePermitPrecondition extends PermitPrecondition {
  public override messageRun(message: Message) {
    const subject = permitSubject(message.guild, message.author.id, message.member, message.channelId);
    if (!subject) return this.outsideGuild();
    const cmd = (message as Message & { command: Command }).command as BaseCommand | undefined;
    const permitNode = cmd?.requiredPermit;
    if (!permitNode) return this.ok();
    return this.checkPermit(subject, permitNode, deniedMessage(permitNode));
  }

  public override chatInputRun(interaction: ChatInputCommandInteraction) {
    const subject = permitSubject(interaction.guild, interaction.user.id, interaction.member, interaction.channelId);
    if (!subject) return this.outsideGuild();
    const cmd = container.stores.get("commands").get(interaction.commandName) as BaseCommand | undefined;
    const permitNode = cmd?.requiredPermit;
    if (!permitNode) return this.ok();
    return this.checkPermit(subject, permitNode, deniedMessage(permitNode));
  }

  public override contextMenuRun(interaction: ContextMenuCommandInteraction) {
    const subject = permitSubject(interaction.guild, interaction.user.id, interaction.member, interaction.channelId);
    if (!subject) return this.outsideGuild();
    const cmd = container.stores.get("commands").get(interaction.commandName) as BaseCommand | undefined;
    const permitNode = cmd?.requiredPermit;
    if (!permitNode) return this.ok();
    return this.checkPermit(subject, permitNode, deniedMessage(permitNode));
  }
}
