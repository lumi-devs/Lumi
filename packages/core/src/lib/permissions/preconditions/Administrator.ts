import { Precondition, container } from "@sapphire/framework";
import type { ChatInputCommandInteraction, Message } from "discord.js";

declare module "@sapphire/framework" {
  interface Preconditions {
    Administrator: never;
  }
}

function memberRoleIds(member: unknown): string[] {
  if (!member || typeof member !== "object") return [];
  const roles = (member as { roles?: unknown }).roles;
  if (Array.isArray(roles)) return roles as string[];
  const cache = (roles as { cache?: { keys?: () => Iterable<string> } })?.cache;
  if (cache && typeof cache.keys === "function") return Array.from(cache.keys());
  if (cache && typeof cache === "object") return Object.keys(cache);
  return [];
}

export class AdministratorPrecondition extends Precondition {
  public override messageRun(message: Message) {
    if (!message.guild) return this.ok();
    return this.#check(message.guild.id, message.author.id, memberRoleIds(message.member));
  }

  public override chatInputRun(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return this.ok();
    return this.#check(interaction.guild.id, interaction.user.id, memberRoleIds(interaction.member));
  }

  async #check(guildId: string, userId: string, roleIds: string[]) {
    const hasPermit = await container.permitResolver.hasPermit({
      guildId,
      userId,
      roleIds,
      permitNode: "admin.*",
      guildOwnerId: "",
    });
    return hasPermit
      ? this.ok()
      : this.error({
          identifier: "PermissionDenied",
          message: "You need at least **Administrator** level to use this.",
        });
  }
}
