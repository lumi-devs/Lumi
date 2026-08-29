import { container, type Command } from "@sapphire/framework";
import type {
  ChatInputCommandInteraction,
  ContextMenuCommandInteraction,
  Message,
} from "discord.js";
import type { BaseCommand } from "#lib/commands.js";
import { PermitPrecondition } from "#lib/permissions/PermitPrecondition.js";

declare module "@sapphire/framework" {
  interface Preconditions {
    RequirePermit: never;
  }
}

/**
 * Extracts a member's role IDs, highest Discord role position first -
 * matching the precedence order PermitResolver walks roles in. The
 * @everyone role (always position 0, and whose ID always equals the guild's)
 * is deliberately kept, not filtered out: it's a real, independently
 * assignable custom-permit target (grant/deny "to everyone in this guild"),
 * and since it always sorts last, it doubles as the implicit server-wide
 * default tier without needing separate schema for one. Position data is
 * only available from a full GuildMember's role Collection (real
 * gateway/interaction runtime); the raw-array fallback (a partial/API member
 * shape, or a test double) has no position to sort by and is returned as-is.
 */
export function memberRoleIds(member: unknown): string[] {
  if (!member || typeof member !== "object") return [];
  const roles = (member as { roles?: unknown }).roles;

  if (Array.isArray(roles)) return roles as string[];

  const cache = (roles as { cache?: unknown })?.cache;
  if (cache instanceof Map) {
    return Array.from(cache as Map<string, { position?: number }>)
      .sort(([, a], [, b]) => (b.position ?? -1) - (a.position ?? -1))
      .map(([id]) => id);
  }
  if (cache && typeof cache === "object") {
    return Object.keys(cache);
  }
  return [];
}

export class RequirePermitPrecondition extends PermitPrecondition {
  public override messageRun(message: Message) {
    if (!message.guild) return this.outsideGuild();
    const cmd = (message as Message & { command: Command }).command as BaseCommand | undefined;
    const permitNode = cmd?.requiredPermit;
    if (!permitNode) return this.ok();
    return this.checkPermit(
      message.guild.id,
      message.author.id,
      memberRoleIds(message.member),
      message.channelId,
      permitNode,
      message.guild.ownerId,
      `You lack the required permit (\`${permitNode}\`) to execute this command.`,
    );
  }

  public override chatInputRun(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return this.outsideGuild();
    const cmd = container.stores.get("commands").get(interaction.commandName) as BaseCommand | undefined;
    const permitNode = cmd?.requiredPermit;
    if (!permitNode) return this.ok();
    return this.checkPermit(
      interaction.guild.id,
      interaction.user.id,
      memberRoleIds(interaction.member),
      interaction.channelId,
      permitNode,
      interaction.guild.ownerId,
      `You lack the required permit (\`${permitNode}\`) to execute this command.`,
    );
  }

  public override contextMenuRun(interaction: ContextMenuCommandInteraction) {
    if (!interaction.guild) return this.outsideGuild();
    const cmd = container.stores.get("commands").get(interaction.commandName) as BaseCommand | undefined;
    const permitNode = cmd?.requiredPermit;
    if (!permitNode) return this.ok();
    return this.checkPermit(
      interaction.guild.id,
      interaction.user.id,
      memberRoleIds(interaction.member),
      interaction.channelId,
      permitNode,
      interaction.guild.ownerId,
      `You lack the required permit (\`${permitNode}\`) to execute this command.`,
    );
  }
}
