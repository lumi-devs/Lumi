import { defineModule } from "@lumi/lib/module-system/module.js";
import { NoEndUserData } from "@lumi/lib/module-system/meta.js";

export const dashboardModule = defineModule({
  name: "dashboard",
  displayName: "Dashboard",
  emoji: "🖥️",
  description:
    "Integrates the bot with the Lumi Web Dashboard. Provides RPC endpoints for management.",
  short: "Web dashboard integration and RPC management endpoints.",
  endUserDataStatement: NoEndUserData(),
  category: "System",
});
