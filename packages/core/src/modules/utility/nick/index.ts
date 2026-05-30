import { Module, DefineModule } from "#core/module-system/Module.js";
import { Emojis } from "#utilities/assets.js";

@DefineModule({
  name: "nick",
  displayName: "Nickname",
  emoji: Emojis.GEAR,
  version: "1.0.0",
  description: "Nickname management commands.",
  dependencies: ["utility"],
})
export class NickModule extends Module {}
