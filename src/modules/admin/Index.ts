import { defineModule } from "#src/lib/module-system/Module.js";

export const adminModule = defineModule({
  name: "admin",
  displayName: "Admin",
  description: "Module management, addon downloads, and server administration.",
  short: "Module manager and server admin tools.",
  endUserDataStatement:
    "Stores module enablement, downloader repos, and server-lock state. Handled centrally during GDPR erasure.",
  emoji: "🛠️",
  disableable: false,
  category: "System",
});
