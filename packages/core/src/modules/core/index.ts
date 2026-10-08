import { defineModule } from "#lib/module-system/Module.js";
import { Emojis } from "#lib/utilities/assets.js";

import { registerTaskFireHandler } from "#lib/scheduler/fires.js";
import { handleDataRetentionFire } from "./services/data-retention.js";
import {
  handleGdprExportCleanupFire,
  handleGdprExportFire,
} from "./services/gdpr-export-task.js";

export const coreModule = defineModule({
  name: "core",
  displayName: "Core",
  description: "The built-in core module.",
  short: "Essential bot commands, module management, and administrative panels.",
  endUserDataStatement:
    "Stores user IDs in permit assignments, system blocklists, and audit logs. Handled centrally during GDPR erasure.",
  emoji: Emojis.Shield,
  disableable: false,
  category: "System",
  onLoad() {
    registerTaskFireHandler(
      "data-retention-sweep",
      "unicast",
      handleDataRetentionFire,
    );
    registerTaskFireHandler("gdpr-export", "unicast", handleGdprExportFire);
    registerTaskFireHandler(
      "gdpr-export-cleanup",
      "unicast",
      handleGdprExportCleanupFire,
    );
  },
});
