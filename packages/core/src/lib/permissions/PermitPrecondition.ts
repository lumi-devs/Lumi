import { Precondition, container } from "@sapphire/framework";

export abstract class PermitPrecondition extends Precondition {
  // A guild-scoped permit can never be satisfied outside a guild, so missing
  // guild context must deny rather than skip the check.
  protected outsideGuild() {
    return this.error({
      identifier: "PermissionDenied",
      message: "This command can only be used in a server.",
    });
  }

  protected async checkPermit(
    guildId: string,
    userId: string,
    roleIds: string[],
    channelId: string,
    permitNode: string,
    guildOwnerId: string | undefined,
    deniedMessage: string,
  ) {
    const hasPermit = await container.permitResolver.hasPermit({
      guildId,
      userId,
      roleIds,
      channelId,
      permitNode,
      guildOwnerId,
    });
    return hasPermit
      ? this.ok()
      : this.error({ identifier: "PermissionDenied", message: deniedMessage });
  }
}
