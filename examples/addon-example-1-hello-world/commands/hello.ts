import { ApplyOptions } from "@sapphire/decorators";
import { container, type Command } from "@sapphire/framework";
import { BaseCommand, type CommandContext } from "lumi/commands";

@ApplyOptions<BaseCommand.Options>({
  name: "hello",
  description: "Say hello.",
  cooldownDelay: 5_000,
})
export default class HelloCommand extends BaseCommand {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder.setName(this.name).setDescription(this.description),
    );
  }

  public override async run(ctx: CommandContext) {
    if (!ctx.guildId) {
      return ctx.replyError("Guild Only", "This command only works inside a server.");
    }

    // Read the module's own configSchema value back out via ConfigService.
    // Falls back to the default declared in the schema if never set.
    const greetingRaw = await container.db.config.getModuleConfig(
      ctx.guildId,
      "hello-world",
      "greeting",
    );
    const greeting = typeof greetingRaw === "string" ? greetingRaw : null;

    return ctx.replySuccess("👋 Hello!", greeting ?? "Hello from Lumi!");
  }
}
