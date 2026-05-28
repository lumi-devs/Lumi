import { Module, EmberModule } from "#core/module-system/Module.js";
import { EmberEmojis } from "#utilities/assets.js";

@EmberModule({
  name: "utility",
  displayName: "Utility",
  emoji: EmberEmojis.GEAR,
  version: "1.0.0",
  description: "General utility commands.",
})
export class UtilityModule extends Module {}
