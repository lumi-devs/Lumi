import { defineModule } from "@lumi/module-kit";
import { z } from "zod";

const CommunitySupermodule = defineModule({
  name: "community",
  displayName: "Community",
  emoji: "👥",
  description: "Community features: leveling and economy",
  version: "2.0.0",
  config: z.object({}),
  commands: [],
  listeners: [],
  tasks: [],
  async onLoad() {
    console.log("[community] Supermodule loaded");
    return [];
  },
  async onUnload() {
    console.log("[community] Supermodule unloaded");
  },
});

export default CommunitySupermodule;
