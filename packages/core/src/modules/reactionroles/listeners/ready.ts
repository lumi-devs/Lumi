import { Events } from "discord.js";
import { defineListener } from "@lumi/lib/listeners/listener-def.js";
import type { Container } from "@lumi/lib/services.js";
import type { Client } from "discord.js";
import { logError } from "@lumi/lib/utilities/errors.js";
import { reactionRoleRegistry } from "@lumi/application/services/reactionroles/registry.js";

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
