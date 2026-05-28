import { Module, EmberModule, cfg } from "#core/module-system/Module.js";
import { EmberEmojis } from "#utilities/assets.js";
import { registerTaskFireHandler } from "#core/lib/task-fire-registry.js";
import { handleThreadCleanerFire } from "./lib/cleanup-handler.js";

@EmberModule({
  name: "thread_cleaner",
  displayName: "Thread Cleaner",
  emoji: EmberEmojis.CLEANUP,
  version: "1.0.0",
  description: "Automatically archives threads after a period of inactivity.",
  configSchema: cfg.object({
    enabled_channels: cfg.string({
      label: "Enabled Channels",
      description:
        "A comma-separated list of channel IDs where new threads should be tracked.",
      list: true,
    }),
    inactive_duration: cfg.string({
      label: "Inactivity Duration",
      description:
        "The duration of inactivity before a thread is archived (e.g., '24h', '3d', '1w').",
      default: "3d",
    }),
    action: cfg.enum(["archive", "lock"], {
      label: "Cleanup Action",
      description: "The action to perform on the thread after the duration.",
      default: "archive",
    }),
  }),
})
export class ThreadCleanerModule extends Module {
  public override onLoad() {
    registerTaskFireHandler(
      "thread-cleaner-task",
      "unicast",
      handleThreadCleanerFire,
    );
    return super.onLoad();
  }
}
