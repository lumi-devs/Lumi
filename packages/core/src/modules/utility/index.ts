import { Module, DefineModule } from "#core/module-system/Module.js";
import { Emojis } from "#utilities/assets.js";

@DefineModule({
  name: "utility",
  displayName: "Utility",
  emoji: Emojis.GEAR,
  version: "1.0.0",
  description: "General utility commands.",
})
export class UtilityModule extends Module {}
