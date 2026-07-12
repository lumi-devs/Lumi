import { Module, DefineModule } from "#lib/module-system/Module.js";
import { Emojis } from "#lib/utilities/assets.js";

@DefineModule({
  name: "whois",
  displayName: "Whois / User Info",
  emoji: Emojis.STAR,
  version: "1.0.0",
  description: "Displays information about a user or guild member.",
})
export class WhoisModule extends Module {}
