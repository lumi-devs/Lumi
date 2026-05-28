import { Module, EmberModule, cfg } from "#core/module-system/Module.js";
import { EmberEmojis } from "#utilities/assets.js";

@EmberModule({
  name: "user_media",
  displayName: "User Media",
  emoji: EmberEmojis.MEMBERS,
  version: "1.0.0",
  description: "Commands to display user avatars and banners.",
  configSchema: cfg.object({
    cooldown_seconds: cfg.number({
      label: "Cooldown (seconds)",
      description: "Rate limit per user for avatar/banner commands.",
      default: 10,
    }),
  }),
})
export class UserMediaModule extends Module {}
