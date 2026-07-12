import { Module, DefineModule } from "#lib/module-system/Module.js";
import { Emojis } from "#lib/utilities/assets.js";

@DefineModule({
  name: "utility",
  displayName: "Utility",
  emoji: Emojis.GEAR,
  version: "1.0.0",
  description: "General utility commands.",
})
export class UtilityModule extends Module {}
