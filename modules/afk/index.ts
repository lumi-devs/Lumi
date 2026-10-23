import { defineModule } from "@lumi/module-kit";
import { afkCommand, afkCleanCommand, afkListCommand } from "./commands.ts";
import { afkConfigSchema } from "./config.ts";
import { afkMessageListener } from "./listener.ts";

const afkModule = defineModule({
  name: "afk",
  displayName: "AFK",
  emoji: "💤",
  description: "Set yourself AFK, mention alerts, nickname prefix, and stale-entry cleanup.",
  config: afkConfigSchema,
  configFields: [
    {
      key: "nick_prefix_enabled",
      label: "Nickname Prefix",
      type: "boolean",
      description: "Prefix nicknames with [AFK] while a member is away.",
    },
  ],
  commands: [afkCommand, afkListCommand, afkCleanCommand],
  listeners: [afkMessageListener],
  onLoad(services) {
    services.logger.info({ module: "afk" }, "afk module loaded");
  },
});

export default afkModule;
