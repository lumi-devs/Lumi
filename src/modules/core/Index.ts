import { defineModule } from "#src/lib/module-system/Module.js";

import { registerTaskFireHandler } from "#src/lib/scheduler/Fires.js";
import { handleDataRetentionFire } from "#src/modules/core/services/DataRetention.js";
import {
  handleGdprExportCleanupFire,
  handleGdprExportFire,
} from "#src/modules/core/services/GdprExportTask.js";

export const coreModule = defineModule({
  name: "core",
  displayName: "Core",
  description: "The built-in core module.",
  short: "Essential bot commands, module management, and administrative panels.",
  endUserDataStatement:
    "Stores user IDs in permit assignments, system blocklists, and audit logs. Handled centrally during GDPR erasure.",
  emoji: "🛡️",
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
