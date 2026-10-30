import { defineModule } from "@lumi/module-kit";
import { z } from "zod";
import { rolemenuCommand } from "./commands.js";
import {
  roleMenuInteractionListener,
  roleMenuReactionAddListener,
  roleMenuReactionRemoveListener,
} from "./listeners.js";
import { tempRoleSweep } from "./temp-roles.js";

const RoleMenusMenuModule = defineModule({
  name: "role-menus-menu",
  displayName: "Role Menus",
  emoji: "🎭",
  description:
    "Create and post self-service role menus with optional temporary roles",
  version: "2.0.0",
  config: z.object({}),
  commands: [rolemenuCommand],
  listeners: [
    roleMenuInteractionListener,
    roleMenuReactionAddListener,
    roleMenuReactionRemoveListener,
  ],
  tasks: [tempRoleSweep],
  async onLoad(_services) {
    console.log("[role-menus-menu] Module loaded");
    return [];
  },
  async onUnload() {
    console.log("[role-menus-menu] Module unloaded");
  },
});

export default RoleMenusMenuModule;
