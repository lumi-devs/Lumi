import { defineModule } from "#src/lib/module-system/Module.js";
import { NoEndUserData } from "#src/lib/module-system/Meta.js";
import { cfg } from "#src/lib/module-system/ConfigSchema.js";

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
