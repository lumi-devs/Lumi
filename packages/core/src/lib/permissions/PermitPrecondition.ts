import { Precondition, container } from "@sapphire/framework";
import type { PermitSubject } from "#lib/permissions/subject.js";

export abstract class PermitPrecondition extends Precondition {
  // A guild-scoped permit can never be satisfied outside a guild, so missing
  // guild context must deny rather than skip the check.
  protected outsideGuild() {
    return this.error({
      identifier: "PermissionDenied",
      message: "This command can only be used in a server.",
    });
  }

  protected async checkPermit(subject: PermitSubject, permitNode: string, deniedMessage: string) {
    const hasPermit = await container.permitResolver.hasPermit({ ...subject, permitNode });
    return hasPermit
      ? this.ok()
      : this.error({ identifier: "PermissionDenied", message: deniedMessage });
  }
}
