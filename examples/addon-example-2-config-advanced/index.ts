import { cfg, DefineModule, Module } from "lumi";

@DefineModule({
  name: "tag-manager",
  displayName: "Tag Manager",
  emoji: "🏷️",
  version: "1.0.0",
  description: "Create custom text tags that anyone can recall with /tag.",
  // Five distinct field types, each exercising a different validation path.
  configSchema: cfg.object({
    enabled: cfg.boolean({
      label: "Enabled",
      description: "Turn tag lookups on or off without disabling the whole addon.",
      default: true,
    }),
    max_tags: cfg.number({
      label: "Max Tags",
      description: "Maximum number of tags this server can store.",
      default: 25,
      min: 1,
      max: 100,
    }),
    default_response: cfg.string({
      label: "Not Found Message",
      description: "Shown when a looked-up tag doesn't exist.",
      default: "That tag doesn't exist.",
    }),
    trigger_mode: cfg.enum(["exact", "contains"] as const, {
      label: "Trigger Mode",
      description: "'exact' matches the tag name exactly; 'contains' matches if the name appears anywhere in the input.",
      default: "exact",
    }),
    log_channel_id: cfg.channel({
      label: "Log Channel",
      description: "Optional channel to post a message whenever a tag is created or deleted.",
      required: false,
    }),
  }),
})
export class TagManagerModule extends Module {
  public override async deleteUserData(): Promise<void> {
    // Tags are stored per-tag-name, not per-user - nothing to scrub here.
    // (If you tracked "created by" and wanted to honor deletion requests by
    // anonymizing authorship, this is where you'd do it.)
  }
}
