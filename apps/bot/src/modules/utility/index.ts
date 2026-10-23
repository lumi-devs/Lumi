import { defineModule } from "@lumi/bot-kit";
import {
  avatarCommand,
  bannerCommand,
  nickCommand,
  purgeCommand,
  serverinfoCommand,
  whoisCommand,
} from "./commands.ts";
import { utilityConfigSchema } from "./config.ts";

const utilityModule = defineModule({
  name: "utility",
  displayName: "Utility",
  emoji: "🛠️",
  description: "Essential server and member utilities: avatar, banner, whois, serverinfo, nick, and purge.",
  config: utilityConfigSchema,
  configFields: [
    {
      key: "max_purge_limit",
      label: "Max Purge Limit",
      type: "number",
      description: "Highest number of messages a single purge may delete.",
      min: 1,
      max: 100,
    },
    {
      key: "allow_self_nick",
      label: "Allow Self Nickname",
      type: "boolean",
      description: "Let members change their own nickname with the bot.",
    },
  ],
  commands: [avatarCommand, bannerCommand, whoisCommand, serverinfoCommand, nickCommand, purgeCommand],
  listeners: [],
  onLoad(services) {
    services.logger.info({ module: "utility" }, "utility module loaded");
  },
});

export default utilityModule;
