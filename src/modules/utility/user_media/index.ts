import { Module, EmberModule, FieldType } from "#core/module-system/Module.js";
import { EmberEmojis } from "#utilities/assets.js";

@EmberModule({
  name: "user_media",
  displayName: "User Media",
  emoji: EmberEmojis.MEMBERS,
  version: "1.0.0",
  description: "Commands to display user avatars and banners.",
  configFields: [
    {
      key: "cooldown_seconds",
      label: "Cooldown (seconds)",
      type: FieldType.NUMBER,
      description: "Rate limit per user for avatar/banner commands.",
      default: 10,
      required: false,
    },
  ],
})
export class UserMediaModule extends Module {
  public registerServices() {}
}
