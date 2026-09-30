import { BaseCommand, type CommandContext, type CommandRegistry } from "lumi/commands";
import { getModuleConfig } from "lumi/config";

export default class HelloCommand extends BaseCommand {
  public constructor() {
    super({ name: "hello", description: "Say hello.", cooldownDelay: 5_000 });
  }

  public override registerApplicationCommands(registry: CommandRegistry) {
    registry.registerChatInputCommand((builder) =>
      builder.setName(this.name).setDescription(this.description),
    );
  }

  public override async run(ctx: CommandContext) {
    if (!ctx.guildId) {
      return ctx.replyError("Guild Only", "This command only works inside a server.");
    }

    const greeting = await getModuleConfig("greeting");
    return ctx.replySuccess(
      "👋 Hello!",
      typeof greeting === "string" ? greeting : "Hello from Lumi!",
    );
  }
}
