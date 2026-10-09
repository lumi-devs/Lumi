import { defineCommand, type CommandContext } from "lumi/commands";
import { getModuleConfig } from "lumi/config";

export default defineCommand({
  name: "hello",
  description: "Say hello.",
  build: () => ({ name: "hello", description: "Say hello." }),
  run: async (ctx: CommandContext) => {
    if (!ctx.guildId) {
      return ctx.replyError("Guild Only", "This command only works inside a server.");
    }

    const greeting = await getModuleConfig("greeting");
    return ctx.replySuccess(
      "👋 Hello!",
      typeof greeting === "string" ? greeting : "Hello from Lumi!",
    );
  },
});
