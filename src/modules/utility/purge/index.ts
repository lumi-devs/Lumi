import { Module, EmberModule } from "#core/module-system/Module.js";
import { EmberEmojis } from "#utilities/assets.js";

@EmberModule({
  name: "purge",
  displayName: "Purge",
  emoji: EmberEmojis.CLEANUP,
  version: "1.0.0",
  description: "Bulk message deletion commands.",
})
export class PurgeModule extends Module {
  public registerServices() {}
}
