import type {
  ChatInputCommandInteraction,
  ContextMenuCommandInteraction,
  Message,
} from "discord.js";
import type {
  ChatInputCommand,
  ContextMenuCommand,
  MessageCommand,
} from "@sapphire/framework";
import { LumiPrecondition } from "#lib/discord-adapter/LumiPrecondition.js";
import { authorize } from "#lib/permissions/authorize.js";
import type { PermitSubject } from "#lib/permissions/subject.js";
import { permitSubject } from "#lib/permissions/subject.js";

declare module "@sapphire/framework" {
  interface Preconditions {
    LumiPermission: never;
  }
}

function requiredPermitOf(command: object, context: unknown): string | undefined {
  if (typeof context === "string" && context.length > 0) return context;
  return "requiredPermit" in command && typeof command.requiredPermit === "string"
    ? command.requiredPermit
    : undefined;
}

function deniedMessage(node: string): string {
  return `You lack the required permit (\`${node}\`) to use this.`;
}

export class LumiPermissionPrecondition extends LumiPrecondition {
  protected outsideGuild() {
    return this.error({
      identifier: "PermissionDenied",
      message: "This command can only be used in a server.",
    });
  }

  protected async checkPermit(subject: PermitSubject, permitNode: string, message: string) {
    const allowed = await authorize(subject, { kind: "permit", node: permitNode });
    return allowed
      ? this.ok()
      : this.error({ identifier: "PermissionDenied", message });
  }

  public override messageRun(message: Message, command: MessageCommand, context?: unknown) {
    const subject = permitSubject(message.guild, message.author.id, message.member, message.channelId);
    if (!subject) return this.outsideGuild();
    const permitNode = requiredPermitOf(command, context);
    if (!permitNode) return this.ok();
    return this.checkPermit(subject, permitNode, deniedMessage(permitNode));
  }

  public override chatInputRun(interaction: ChatInputCommandInteraction, command: ChatInputCommand, context?: unknown) {
    const subject = permitSubject(interaction.guild, interaction.user.id, interaction.member, interaction.channelId);
    if (!subject) return this.outsideGuild();
    const permitNode = requiredPermitOf(command, context);
    if (!permitNode) return this.ok();
    return this.checkPermit(subject, permitNode, deniedMessage(permitNode));
  }

  public override contextMenuRun(interaction: ContextMenuCommandInteraction, command: ContextMenuCommand, context?: unknown) {
    const subject = permitSubject(interaction.guild, interaction.user.id, interaction.member, interaction.channelId);
    if (!subject) return this.outsideGuild();
    const permitNode = requiredPermitOf(command, context);
    if (!permitNode) return this.ok();
    return this.checkPermit(subject, permitNode, deniedMessage(permitNode));
  }
}
