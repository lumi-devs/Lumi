import { Module, EmberModule, FieldType } from "#core/module-system/Module.js";
import { EmberEmojis } from "#utilities/assets.js";

@EmberModule({
  name: "thread_cleaner",
  displayName: "Thread Cleaner",
  emoji: EmberEmojis.CLEANUP,
  version: "1.0.0",
  description: "Automatically archives threads after a period of inactivity.",
  configFields: [
    {
      key: "enabled_channels",
      label: "Enabled Channels",
      type: FieldType.STRING,
      description:
        "A comma-separated list of channel IDs where new threads should be tracked.",
      required: false,
    },
    {
      key: "inactive_duration",
      label: "Inactivity Duration",
      type: FieldType.STRING,
      description:
        "The duration of inactivity before a thread is archived (e.g., '24h', '3d', '1w').",
      default: "3d",
      required: false,
    },
    {
      key: "action",
      label: "Cleanup Action",
      type: FieldType.ENUM,
      choices: ["archive", "lock"],
      description: "The action to perform on the thread after the duration.",
      default: "archive",
      required: false,
    },
  ],
})
export class ThreadCleanerModule extends Module {
  public registerServices() {
    // No services needed for this module
  }

  /**
   * This module does not store any user-personally-identifiable information.
   * The `TrackedThread` table only stores public Discord IDs and timestamps.
   * Therefore, the GDPR hook is a no-op.
   */
  public override deleteUserData(): void {}
}
