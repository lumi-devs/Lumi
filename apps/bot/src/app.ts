import { ActivityType, Events, type Client } from "discord.js";
import type { CommandDef, LumiServices } from "@lumi/bot-kit";
import { addons } from "./commands/addons.ts";
import { makeHelpCommand } from "./commands/help.ts";
import { modules } from "./commands/modules.ts";
import { ping } from "./commands/ping.ts";
import { applicationCommands, createDispatcher, wireDispatcher } from "./dispatch.ts";

const builtinCommands: CommandDef[] = [ping, modules, addons];
builtinCommands.push(makeHelpCommand(builtinCommands));

export { builtinCommands };

export async function registerApplicationCommands(
  client: Client,
  services: LumiServices,
): Promise<void> {
  if (!client.application) return;
  await client.application.commands.set(applicationCommands(builtinCommands, services));
}

export function wireBuiltins(client: Client, services: LumiServices): void {
  const dispatcher = createDispatcher(services, builtinCommands);
  wireDispatcher(client, dispatcher);

  client.once(Events.ClientReady, async (ready) => {
    try {
      ready.user.setPresence({
        status: "online",
        activities: [{ name: "/help", type: ActivityType.Watching }],
      });
    } catch (error) {
      services.logger.warn({ error }, "failed to set presence");
    }

    const commands = builtinCommands.length + services.modules.commands().length;
    await registerApplicationCommands(ready, services).catch((error: unknown) => {
      services.logger.error({ error }, "failed to register application commands");
    });

    services.logger.info(
      {
        guilds: ready.guilds.cache.size,
        commands,
        modules: services.modules.all().map((module) => module.definition.name),
      },
      "ready",
    );
  });

  client.on(Events.GuildCreate, (guild) => {
    void services.db.guild.markRejoined(guild.id).catch((error: unknown) => {
      services.logger.error({ error, guildId: guild.id }, "failed to mark guild joined");
    });
  });

  client.on(Events.GuildDelete, (guild) => {
    void services.db.guild.markLeft(guild.id).catch((error: unknown) => {
      services.logger.error({ error, guildId: guild.id }, "failed to mark guild left");
    });
  });

  client.on(Events.Error, (error) => {
    services.logger.error({ error }, "discord client error");
  });
}
