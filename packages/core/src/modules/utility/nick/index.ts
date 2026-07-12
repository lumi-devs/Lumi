import { Module, DefineModule } from "#lib/module-system/Module.js";
import { Emojis } from "#lib/utilities/assets.js";

@DefineModule({
  name: "nick",
  displayName: "Nickname",
  emoji: Emojis.GEAR,
  version: "1.0.0",
  description: "Nickname management commands.",
  dependencies: ["utility"],
})
export class NickModule extends Module {}
