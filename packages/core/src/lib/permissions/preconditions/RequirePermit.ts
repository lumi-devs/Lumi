import { container, Precondition, type Command } from "@sapphire/framework";
import type {
  ChatInputCommandInteraction,
  ContextMenuCommandInteraction,
  Message,
} from "discord.js";
import type { BaseCommand } from "#lib/commands.js";

declare module "@sapphire/framework" {
  interface Preconditions {
    RequirePermit: never;
  }
}

export function memberRoleIds(member: unknown): string[] {
  if (!member || typeof member !== "object") return [];
  const roles = (member as { roles?: unknown }).roles;
  if (Array.isArray(roles)) return roles as string[];
  const cache = (roles as { cache?: { keys?: () => Iterable<string> } })?.cache;
  if (cache && typeof cache.keys === "function") return Array.from(cache.keys());
  if (cache && typeof cache === "object") return Object.keys(cache);
  return [];
}

export class RequirePermitPrecondition extends Precondition {
  public override messageRun(message: Message) {
    if (!message.guild) return this.#outsideGuild();
    const cmd = (message as Message & { command: Command }).command as BaseCommand | undefined;
    const permitNode = cmd?.requiredPermit;
    if (!permitNode) return this.ok();
    return this.#check(message.guild.id, message.author.id, memberRoleIds(message.member), permitNode, message.guild.ownerId);
  }

  public override chatInputRun(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return this.#outsideGuild();
    const cmd = container.stores.get("commands").get(interaction.commandName) as BaseCommand | undefined;
    const permitNode = cmd?.requiredPermit;
    if (!permitNode) return this.ok();
    return this.#check(interaction.guild.id, interaction.user.id, memberRoleIds(interaction.member), permitNode, interaction.guild.ownerId);
  }

  public override contextMenuRun(interaction: ContextMenuCommandInteraction) {
    if (!interaction.guild) return this.#outsideGuild();
    const cmd = container.stores.get("commands").get(interaction.commandName) as BaseCommand | undefined;
    const permitNode = cmd?.requiredPermit;
    if (!permitNode) return this.ok();
    return this.#check(interaction.guild.id, interaction.user.id, memberRoleIds(interaction.member), permitNode, interaction.guild.ownerId);
  }

  // A guild-scoped permit can never be satisfied outside a guild, so missing
  // guild context must deny rather than skip the check.
  #outsideGuild() {
    return this.error({
      identifier: "PermissionDenied",
      message: "This command can only be used in a server.",
    });
  }

  async #check(guildId: string, userId: string, roleIds: string[], permitNode: string, guildOwnerId?: string) {
    const hasPermit = await container.permitResolver.hasPermit({
      guildId,
      userId,
      roleIds,
      permitNode,
      guildOwnerId,
    });
    return hasPermit
      ? this.ok()
      : this.error({
          identifier: "PermissionDenied",
          message: `You lack the required permit (\`${permitNode}\`) to execute this command.`,
        });
  }
}
