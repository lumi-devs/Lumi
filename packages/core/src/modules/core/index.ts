import { Module, DefineModule } from "#lib/module-system/Module.js";
import { Emojis } from "#lib/utilities/assets.js";
import type { Piece } from "@sapphire/framework";

import { registerTaskFireHandler } from "#lib/task-fire-registry.js";
import { handleDataRetentionFire } from "./services/data-retention.js";

@DefineModule({
  name: "core",
  displayName: "Core",
  description: "The built-in core module.",
  short: "Essential bot commands, module management, and administrative panels.",
  endUserDataStatement:
    "Stores user IDs in permit assignments, system blocklists, and audit logs. Handled centrally during GDPR erasure.",
  emoji: Emojis.Shield,
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
      emoji: Emojis.Shield,
    });
  }

  public override onLoad() {
    registerTaskFireHandler(
      "data-retention-sweep",
      "unicast",
      handleDataRetentionFire,
    );
  }
}
