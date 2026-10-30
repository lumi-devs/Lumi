import { defineModule } from "@lumi/module-kit";
import { RoleMenusConfigSchema } from "./config.js";

const RoleMenusSupermodule = defineModule({
  name: "role-menus",
  displayName: "Role Menus",
  emoji: "🎭",
  description:
    "Self-service role menus with buttons, selects, reaction menus, and temporary roles",
  version: "2.0.0",
  config: RoleMenusConfigSchema,
  commands: [],
  listeners: [],
  tasks: [],
  async onLoad(_services) {
    console.log("[role-menus] Supermodule loaded");
    return [];
  },
  async onUnload() {
    console.log("[role-menus] Supermodule unloaded");
  },
});

export default RoleMenusSupermodule;
