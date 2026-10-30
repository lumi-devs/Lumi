import { defineModule } from "@lumi/module-kit";
import { z } from "zod";

const RolesSupermodule = defineModule({
  name: "roles",
  displayName: "Roles",
  emoji: "🎭",
  description:
    "Role automation: join autoroles, voice channel roles, and bulk role jobs",
  version: "2.0.0",
  config: z.object({}),
  commands: [],
  listeners: [],
  tasks: [],
  async onLoad(_services) {
    console.log("[roles] Supermodule loaded");
    return [];
  },
  async onUnload() {
    console.log("[roles] Supermodule unloaded");
  },
});

export default RolesSupermodule;
