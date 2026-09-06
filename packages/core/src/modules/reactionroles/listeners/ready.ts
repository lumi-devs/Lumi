import { Listener, Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type { Client } from "discord.js";
import { logError } from "#lib/utilities/errors.js";
import { reactionRoleRegistry } from "../registry.js";

@ApplyOptions<Listener.Options>({
  name: "reactionrolesReady",
  event: Events.ClientReady,
  once: true,
})
export default class ReactionRolesReadyListener extends Listener<
  typeof Events.ClientReady
> {
  public override run(_client: Client<true>): void {
    try {
      reactionRoleRegistry.wire();
    } catch (err: unknown) {
      logError("ReactionRoles: registry wire failed", err);
    }
  }
}
