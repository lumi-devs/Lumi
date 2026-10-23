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
  commands: [avatarCommand, bannerCommand, whoisCommand, serverinfoCommand, nickCommand, purgeCommand],
  listeners: [],
  onLoad(services) {
    services.logger.info({ module: "utility" }, "utility module loaded");
  },
});

export default utilityModule;
