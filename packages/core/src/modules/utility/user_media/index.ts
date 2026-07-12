import { Module, DefineModule, cfg } from "#lib/module-system/Module.js";
import { Emojis } from "#lib/utilities/assets.js";

@DefineModule({
  name: "user_media",
  displayName: "User Media",
  emoji: Emojis.MEMBERS,
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
