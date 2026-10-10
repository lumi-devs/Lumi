import { defineModule } from "@lumi/lib/module-system/module.js";

import { registerTaskFireHandler } from "@lumi/lib/scheduler/fires.js";
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
