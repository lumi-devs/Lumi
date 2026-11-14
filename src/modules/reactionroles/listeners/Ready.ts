import { Events } from "discord.js";
import { defineListener } from "@listeners/ListenerDef.js";
import type { Container } from "@lib/Services.js";
import type { Client } from "discord.js";
import { logError } from "@utilities/Errors.js";
import { reactionRoleRegistry } from "@modules/reactionroles/data/Registry.js";

const reactionrolesReady = defineListener({
  name: "reactionrolesReady",
  event: Events.ClientReady,
  once: true,
  execute(_services: Container, _client: Client<true>): void {
    try {
      reactionRoleRegistry.wire();
    } catch (err: unknown) {
      logError("ReactionRoles: registry wire failed", err);
    }
  },
});

export default reactionrolesReady;
