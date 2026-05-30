import { Module, DefineModule } from "#core/module-system/Module.js";
import { Emojis } from "#utilities/assets.js";

@DefineModule({
  name: "purge",
  displayName: "Purge",
  emoji: Emojis.CLEANUP,
  version: "1.0.0",
  description: "Bulk message deletion commands.",
})
export class PurgeModule extends Module {}
