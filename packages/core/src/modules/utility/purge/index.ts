import { Module, DefineModule } from "#lib/module-system/Module.js";
import { Emojis } from "#lib/utilities/assets.js";

@DefineModule({
  name: "purge",
  displayName: "Purge",
  emoji: Emojis.CLEANUP,
  version: "1.0.0",
  description: "Bulk message deletion commands.",
})
export class PurgeModule extends Module {}
