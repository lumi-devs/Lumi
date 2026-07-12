import { Module, DefineModule } from "#core/module-system/Module.js";
import { Emojis } from "#utilities/assets.js";

@DefineModule({
  name: "whois",
  displayName: "Whois / User Info",
  emoji: Emojis.STAR,
  version: "1.0.0",
  description: "Displays information about a user or guild member.",
})
export class WhoisModule extends Module {}
