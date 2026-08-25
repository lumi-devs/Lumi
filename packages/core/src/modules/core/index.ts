import { Module, DefineModule } from "#lib/module-system/Module.js";
import { Emojis } from "#lib/utilities/assets.js";
import type { Piece } from "@sapphire/framework";

@DefineModule({
  name: "core",
  displayName: "Core",
  description: "The built-in core module.",
  emoji: Emojis.SHIELD,
  version: "1.0.0",
  disableable: false,
  category: "System",
})
export class CoreModule extends Module {
  public constructor(
    context: Piece.LoaderContext,
    options: Piece.Options = {},
  ) {
    super(context, {
      ...options,
      name: "core",
      enabled: true,
      displayName: "Core",
      description: "The built-in core module.",
      emoji: Emojis.SHIELD,
    });
  }
}
