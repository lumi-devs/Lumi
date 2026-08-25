import { Module, DefineModule, cfg } from "#lib/module-system/Module.js";
import { Emojis } from "#lib/utilities/assets.js";

@DefineModule({
  name: "utility",
  displayName: "Utility",
  emoji: Emojis.GEAR,
  version: "1.0.0",
  description: "General utility commands.",
  category: "Community",
  configSchema: cfg.object({
    cooldown_seconds: cfg.number({
      label: "Cooldown (seconds)",
      description: "Rate limit per user for avatar/banner commands.",
      default: 10,
    }),
  }),
})
export class UtilityModule extends Module {}
