import { Module, DefineModule } from "#core/module-system/Module.js";
import { Emojis } from "#utilities/assets.js";

@DefineModule({
  name: "serverinfo",
  displayName: "Server Info",
  emoji: Emojis.GUILD,
  version: "1.0.0",
  description: "Displays detailed information about the server.",
})
export class ServerInfoModule extends Module {}
