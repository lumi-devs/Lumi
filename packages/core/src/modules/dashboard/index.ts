import { defineModule } from "#lib/module-system/Module.js";
import { NoEndUserData } from "#lib/module-system/meta.js";

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
