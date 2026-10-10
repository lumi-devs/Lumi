import { defineModule } from "@lumi/lib/module-system/module.js";
import { NoEndUserData } from "@lumi/lib/module-system/meta.js";
import { cfg } from "@lumi/lib/module-system/config-schema.js";

export const utilityModule = defineModule({
  name: "utility",
  displayName: "Utility",
  emoji: "⚙️",
  description: "General utility commands.",
  short: "Helpful server tools, avatar lookups, and user info commands.",
  endUserDataStatement: NoEndUserData(),
  category: "Community",
  configSchema: cfg.object({
    cooldown_seconds: cfg.number({
      label: "Cooldown (seconds)",
      description: "Rate limit per user for avatar/banner commands.",
      default: 10,
    }),
  }),
});
