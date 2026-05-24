import { Module, EmberModule } from "#core/module-system/Module.js";
import { EmberEmojis } from "#utilities/assets.js";

@EmberModule({
  name: "nick",
  displayName: "Nickname",
  emoji: EmberEmojis.GEAR,
  version: "1.0.0",
  description: "Nickname management commands.",
  dependencies: ["utility"],
})
export class NickModule extends Module {
  public registerServices() {}

  public override onLoad() {
    this.container.stores.registerPath(new URL("./commands/", import.meta.url));
    return super.onLoad();
  }
}
