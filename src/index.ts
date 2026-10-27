import { createClient, createCoreServices, createRpcServer, boot, shutdown, pingCommand, handlePingButton, aboutCommand } from "@lumi/core";
import { createModuleLoader } from "@lumi/module-runtime";
import { createRedisClient, InvalidationBus } from "@lumi/redis";
import { createCache } from "@lumi/cache";
import { prisma, connectDatabase, disconnectDatabase } from "@lumi/db";
import { PermitRepository } from "@lumi/permits";
import {
  ConfigService,
  handleHubInteraction,
  ModuleManager,
  PermitPanel,
  hasAdminAccess,
  moduleCommands,
  roleIdsFrom,
} from "@lumi/admin";
import {
  DiscordAPIError,
  HTTPError,
  RESTJSONErrorCodes,
} from "discord.js";
import * as ui from "@lumi/ui";
import { CommandRegistry, ModuleHost, commandPayloadForGuild } from "./core/modules.js";
import { DistributedScheduler } from "@lumi/scheduler";
import { AddonManager } from "@lumi/downloader";
import {
  activeModules,
  commandsExecuted,
  createHealthMonitor,
  guildsTotal,
  httpRequestDuration,
  httpRequests,
  shardsOnline,
  startMetricsServer,
  usersTotal,
} from "@lumi/observability";

const logger = {
  info: (msg: string, meta?: any) => console.log(msg, meta ?? ""),
  warn: (msg: string, meta?: any) => console.warn(msg, meta ?? ""),
  error: (msg: string, meta?: any) => console.error(msg, meta ?? ""),
  debug: (msg: string, meta?: any) => {
    if (process.env.LOG_LEVEL === "debug") console.debug(msg, meta ?? "");
  },
};

function messageForDiscordCode(code: number): string | null {
  switch (code) {
    case RESTJSONErrorCodes.UnknownChannel:
      return "That channel no longer exists.";
    case RESTJSONErrorCodes.UnknownGuild:
      return "This server is no longer available.";
    case RESTJSONErrorCodes.UnknownMember:
      return "That member is no longer in the server.";
    case RESTJSONErrorCodes.UnknownMessage:
      return "That message no longer exists.";
    case RESTJSONErrorCodes.UnknownRole:
      return "That role no longer exists.";
    case RESTJSONErrorCodes.UnknownUser:
      return "That user could not be found.";
    case RESTJSONErrorCodes.MissingAccess:
      return "I don't have access to do that here.";
    case RESTJSONErrorCodes.MissingPermissions:
      return "I'm missing the permissions to do that.";
    case RESTJSONErrorCodes.CannotSendMessagesToThisUser:
      return "I can't message that user - their DMs are closed.";
    default:
      return null;
  }
}

function messageForHttpStatus(status: number): string | null {
  switch (status) {
    case 500:
      return "Discord ran into an internal error. Please try again shortly.";
    case 502:
    case 504:
      return "Discord's gateway is unavailable right now. Please try again shortly.";
    case 503:
      return "Discord is temporarily unavailable. Please try again shortly.";
    default:
      return null;
  }
}

function commandErrorCard(error: unknown): any {
  if (error instanceof DiscordAPIError) {
    return ui.ephemeralCard(
      ui.makeErrorCard(
        "Action Failed",
        messageForDiscordCode(Number(error.code)) ??
          "Discord rejected that action.",
      ),
    );
  }
  if (error instanceof HTTPError) {
    return ui.ephemeralCard(
      ui.makeErrorCard(
        "Discord Unavailable",
        messageForHttpStatus(error.status) ??
          "Discord is having issues. Please try again shortly.",
      ),
    );
  }
  if (error instanceof Error && error.name === "AbortError") {
    return ui.ephemeralCard(
      ui.makeErrorCard(
        "Timed Out",
        "That took too long and was cancelled. Please try again.",
      ),
    );
  }
  return ui.ephemeralCard(
    ui.makeErrorCard("Unexpected Error", "An unexpected error occurred."),
  );
}

async function main() {
  console.log("Starting Lumi v2...");

  const redis = createRedisClient({
    host: process.env.REDIS_HOST ?? "localhost",
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD,
  });
  redis.on("error", (err) => logger.error("Redis error:", err.message));

  await redis.connect();
  console.log("Connected to Redis");

  await connectDatabase();
  console.log("Connected to Database");

  const invalidation = new InvalidationBus(redis);
  const cache = createCache({
    redis,
    invalidation,
    defaultTtlMs: 60_000,
    defaultNegativeTtlMs: 15_000,
  });

  const client = createClient();
  createCoreServices(client, redis);

  const permitRepo = new PermitRepository(prisma, redis);

  const moduleLoader = createModuleLoader();
  moduleLoader.addRoot("modules", "bundled");
  moduleLoader.addRoot("data/addons", "addon");


  const configService = new ConfigService(prisma);
  const scheduler = new DistributedScheduler(redis);
  const healthMonitor = createHealthMonitor();

  healthMonitor.register({
    name: "redis",
    check: async () => ({ healthy: redis.status === "ready", details: redis.status }),
  });
  healthMonitor.register({
    name: "discord",
    check: async () => ({ healthy: client.isReady(), details: client.user?.tag ?? "not ready" }),
  });

  const rpcPort = parseInt(process.env.RPC_HTTP_PORT ?? "8091", 10);
  const rpcToken = process.env.RPC_INTERNAL_TOKEN;
  const rpc = createRpcServer({
    port: rpcPort,
    host: process.env.RPC_HTTP_HOST ?? "0.0.0.0",
    handler: async (req, res) => {
      const started = performance.now();
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      const route = url.pathname;
      const method = req.method ?? "GET";

      const finish = (status: number, body: unknown) => {
        const seconds = (performance.now() - started) / 1000;
        httpRequests.inc({ method, route, status: String(status) });
        httpRequestDuration.observe({ method, route, status: String(status) }, seconds);
        res.setHeader("content-type", "application/json");
        res.statusCode = status;
        res.end(JSON.stringify(body));
      };

      if (route === "/healthz" || route === "/livez") {
        const checks = await healthMonitor.runChecks();
        return finish(checks.healthy ? 200 : 503, {
          ok: checks.healthy,
          ready: client.isReady(),
          checks: checks.results,
        });
      }

      if (route === "/readyz") {
        return finish(client.isReady() ? 200 : 503, { ready: client.isReady() });
      }

      if (route === "/api/v1/status") {
        if (rpcToken && req.headers.authorization !== `Bearer ${rpcToken}`) {
          return finish(401, { error: "unauthorized" });
        }
        return finish(200, {
          bot: client.user?.tag ?? null,
          guilds: client.guilds.cache.size,
          users: client.users.cache.size,
          modules: moduleLoader.listGlobal(),
        });
      }

      finish(404, { error: "not found" });
    },
  });
  await rpc.start();
  console.log(`RPC server listening on :${rpcPort}`);

  let metricsServer: { stop(): void } | undefined;
  if (process.env.METRICS_ENABLED !== "false") {
    const metricsPort = parseInt(process.env.METRICS_PORT ?? "9090", 10);
    metricsServer = startMetricsServer(metricsPort, () => client.isReady(), logger);
    console.log(`Metrics server started on :${metricsPort}`);
  }

  const registry = new CommandRegistry();
  const commandPayload = (guildId: string) =>
    commandPayloadForGuild(registry, moduleLoader, guildId);

  const syncGuildCommands = async (guildId: string) => {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;
    await guild.commands
      .set(commandPayload(guildId) as any)
      .catch((error) => logger.error(`Failed to sync commands in ${guildId}:`, error));
  };

  const syncAllGuildCommands = async () => {
    for (const guild of client.guilds.cache.values()) {
      await syncGuildCommands(guild.id);
    }
  };

  const moduleManager = new ModuleManager(moduleLoader, prisma, syncGuildCommands);

  const services = {
    client,
    configService,
    redis,
    cache,
    db: {
      prisma,
      permits: permitRepo,
    },
    prisma,
    permits: permitRepo,
    moduleManager,
    modules: {
      isEnabled: (guildId: string, moduleName: string) => moduleLoader.isEnabled(guildId, moduleName),
    },
    moduleLoader,
    scheduler,
    addons: undefined as unknown as AddonManager,
    config: {
      get: (guildId: string, key: string) => configService.get(guildId, key),
      set: (guildId: string, key: string, value: any) =>
        configService.set(guildId, key, value),
      reset: (guildId: string, key: string) => configService.reset(guildId, key),
      getAll: (guildId: string) => configService.getAll(guildId),
    },
    rpc,
    ui,
    discord: {
      PermissionFlagsBits: (await import("discord.js")).PermissionFlagsBits,
    },
    observability: { healthMonitor },
  };

  const host = new ModuleHost({
    client,
    loader: moduleLoader,
    registry,
    services,
    logger,
    syncCommands: syncAllGuildCommands,
  });

  const addons = new AddonManager({
    prisma,
    redis,
    runtime: host,
    logger,
    notify: async (report) => {
      const ownerIds = (process.env.OWNER_IDS ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      if (ownerIds.length === 0) return;

      const lines = [
        "**Add-on auto-update**",
        ...report.updated.map((name) => `✅ Updated ${name}`),
        ...report.failures.map((failure) => `❌ ${failure.module}: ${failure.error}`),
      ];
      for (const ownerId of ownerIds) {
        const user = await client.users.fetch(ownerId).catch(() => null);
        await user?.send(lines.join("\n")).catch(() => undefined);
      }
    },
  });
  services.addons = addons;

  host.addStatic([pingCommand, aboutCommand, ...moduleCommands]);

  const discovered = await moduleLoader.discover();
  console.log(`Discovered ${discovered.length} modules`);

  const loaded = await host.load(discovered);
  console.log(`Loaded ${loaded.length} modules: ${loaded.map((m) => m.manifest.name).join(", ") || "(none)"}`);
  console.log(`Registered ${registry.size} commands and ${registry.aliasCount} prefix aliases`);

  activeModules.set(loaded.length);

  scheduler.register({
    name: "addons-autoupdate",
    cron: "*/1 * * * *",
    handler: async () => {
      const report = await addons.autoUpdate();
      if (report?.failures.length) {
        logger.warn(`Auto-update failed for ${report.failures.length} add-on(s)`);
      }
    },
  });
  await scheduler.start();

  const syncGuildModules = async (guildId: string) => {
    let rows: any[] = [];
    try {
      rows = await prisma.guildModule.findMany({ where: { guildId } });
    } catch (err) {
      logger.warn("Could not load guild module state, defaulting to enabled:", err);
    }
    for (const module of moduleLoader.listAll()) {
      const row = (rows ?? []).find((r: any) => r.module === module.manifest.name);
      const defaultEnabled = (module.manifest as any).defaultEnabled !== false;
      const enabled = row ? Boolean(row.enabled) : defaultEnabled;
      await moduleLoader.setEnabled(module.manifest.name, guildId, enabled);
    }
  };

  const syncGuildRecord = async (guild: any) => {
    if (!guild?.id) return;
    try {
      await prisma.guild.upsert({
        where: { id: guild.id },
        update: {
          name: guild.name ?? "",
          icon: guild.iconURL?.({ size: 128 }) ?? null,
          ownerId: guild.ownerId ?? "",
          leftAt: null,
        },
        create: {
          id: guild.id,
          name: guild.name ?? "",
          icon: guild.iconURL?.({ size: 128 }) ?? null,
          ownerId: guild.ownerId ?? "",
        },
      });
      await permitRepo.seedBuiltinPermits(guild.id);
    } catch (err) {
      logger.warn(`Could not sync guild ${guild.id}:`, err);
    }
  };

  const registerGuildCommands = async (guild: any) => {
    const payload = commandPayload(guild.id);
    try {
      await guild.commands.set(payload);
      logger.info(`Registered ${payload.length} commands in guild ${guild.name} (${guild.id})`);
    } catch (err) {
      logger.error(`Failed to register commands in guild ${guild.id}:`, err);
    }
  };

  client.once("clientReady", async () => {
    guildsTotal.set(client.guilds.cache.size);
    usersTotal.set(client.users.cache.size);
    shardsOnline.set(client.ws.shards.size);
    activeModules.set(moduleLoader.listAll().length);

    for (const guild of client.guilds.cache.values()) {
      await syncGuildRecord(guild);
      await syncGuildModules(guild.id);
      await registerGuildCommands(guild);
    }

    try {
      await client.application?.commands.set([]);
    } catch (err) {
      logger.debug("Could not clear global commands:", err);
    }

    console.log(`Lumi online as ${client.user?.tag} in ${client.guilds.cache.size} guild(s)`);
  });

  client.on("guildCreate", async (guild) => {
    guildsTotal.set(client.guilds.cache.size);
    await syncGuildRecord(guild);
    await syncGuildModules(guild.id);
    await registerGuildCommands(guild);
  });

  client.on("guildDelete", () => {
    guildsTotal.set(client.guilds.cache.size);
  });

  client.on("messageCreate", async (message) => {
    if (message.partial) {
      const full = await message.fetch().catch(() => null);
      if (!full) return;
      message = full;
    }
    if (message.author.bot || !message.guild) return;

    const prefix = await resolvePrefix(services, client, message);
    if (!prefix) return;

    const withoutPrefix = message.content.slice(prefix.length).trim();
    if (!withoutPrefix) return;

    const [name, ...args] = withoutPrefix.split(/ +/g);
    if (!name) return;

    const command = registry.get(name);
    if (!command) return;
    if (command.module && !moduleLoader.isActive(message.guild.id, command.module)) return;

    if (command.requiresAdmin) {
      const allowed = await hasAdminAccess({
        guildId: message.guild.id,
        userId: message.author.id,
        roleIds: roleIdsFrom(message.member, message.guild.id),
        guildOwnerId: message.guild.ownerId,
        memberPermissions: message.member?.permissions,
        client,
        permits: services.permits,
      });
      if (!allowed) {
        await message
          .reply(
            ui.ephemeralCard(
              ui.makeErrorCard(
                "Missing Permissions",
                "You need **Manage Server** or an admin permit to use that command.",
              ),
            ),
          )
          .catch(() => undefined);
        return;
      }
    }

    const defaultPermissions = command.data.default_member_permissions;
    if (
      defaultPermissions !== null &&
      defaultPermissions !== undefined &&
      !message.member?.permissions.has(BigInt(defaultPermissions))
    ) {
      await message
        .reply(
          ui.ephemeralCard(
            ui.makeErrorCard(
              "Missing Permissions",
              "You do not have permission to use that command.",
            ),
          ),
        )
        .catch(() => undefined);
      return;
    }

    const syntheticInteraction = createSyntheticInteraction(message, command, args, prefix, services);
    try {
      await command.execute(syntheticInteraction as any, services);
    } catch (err) {
      logger.error(`Prefix command ${name} failed:`, err);
      await message
        .reply(commandErrorCard(err))
        .catch(() => undefined);
    }
  });

  async function resolvePrefix(services: any, client: any, message: any): Promise<string | null> {
    const content = message.content;
    const mention = new RegExp(`^<@!?${client.user?.id}>\\s*`).exec(content);
    if (mention) return mention[0];
    if (!message.guild) return null;
    const stored = await services.config.get(message.guild.id, "prefix");
    const prefix = typeof stored === "string" && stored.length > 0 ? stored : ",";
    return content.startsWith(prefix) ? prefix : null;
  }

  const getPanel = (guildId: string, interaction: any) =>
    new PermitPanel({
      prisma,
      redis,
      guildId,
      interaction,
      moduleLoader,
    });

  function createSyntheticInteraction(
    message: any,
    command: any,
    args: string[],
    _prefix: string,
    _services: any,
  ) {
    const guild = message.guild;
    const member = message.member;
    const channel = message.channel;
    const commandName = command.data.name;
    let replied = false;
    let deferred = false;
    let replyMessage: any = null;

    const optionType = (option: any): number | undefined =>
      option?.type ?? option?.toJSON?.()?.type;
    const topOptions: any[] = command.data.options ?? [];
    const subcommand = topOptions.find(
      (option) => {
        const type = optionType(option);
        return (type === 1 || type === 2) && option.name === args[0];
      },
    );
    const definitions: any[] = subcommand
      ? (subcommand.options ?? [])
      : topOptions.filter((option) => {
          const type = optionType(option);
          return type !== 1 && type !== 2;
        });
    const rest = subcommand ? args.slice(1) : args;
    const values = new Map<string, string>();
    const positional: string[] = [];

    for (let index = 0; index < rest.length; index += 1) {
      const value = rest[index]!;
      if (value.startsWith("--")) {
        const next = rest[index + 1];
        if (next !== undefined && !next.startsWith("--")) {
          values.set(value.slice(2), next);
          index += 1;
        }
        continue;
      }
      positional.push(value);
    }

    let position = 0;
    for (const definition of definitions) {
      if (values.has(definition.name)) continue;
      if (position >= positional.length) break;
      values.set(definition.name, positional[position]!);
      position += 1;
    }

    const raw = (name: string): string | null => values.get(name) ?? null;
    const resolveUser = (value: string | null) => {
      if (!value) return null;
      const id =
        /^<@!?(\d+)>$/.exec(value)?.[1] ??
        (/^\d{15,20}$/.test(value) ? value : null);
      return id
        ? (message.client.users.cache.get(id) ?? message.mentions.users.get(id) ?? null)
        : null;
    };
    const resolveMember = (value: string | null) => {
      if (!value) return null;
      const id =
        /^<@!?(\d+)>$/.exec(value)?.[1] ??
        (/^\d{15,20}$/.test(value) ? value : null);
      return id
        ? (guild.members.cache.get(id) ??
            message.mentions.members?.get(id) ??
            null)
        : null;
    };
    const resolveRole = (value: string | null) => {
      if (!value) return null;
      const id =
        /^<@&(\d+)>$/.exec(value)?.[1] ??
        (/^\d{15,20}$/.test(value) ? value : null);
      return id
        ? (guild.roles.cache.get(id) ?? message.mentions.roles.get(id) ?? null)
        : null;
    };
    const resolveChannel = (value: string | null) => {
      if (!value) return null;
      const id =
        /^<#(\d+)>$/.exec(value)?.[1] ??
        (/^\d{15,20}$/.test(value) ? value : null);
      return id
        ? (guild.channels.cache.get(id) ??
            message.mentions.channels.get(id) ??
            null)
        : null;
    };

    return {
      commandName,
      user: message.author,
      member,
      guild,
      guildId: guild.id,
      channel,
      channelId: channel.id,
      client: message.client,
      createdTimestamp: message.createdTimestamp,
      isChatInputCommand: () => true,
      isRepliable: () => true,
      replied: () => replied,
      deferred: () => deferred,
      options: {
        getSubcommand: () => subcommand?.name ?? null,
        getSubcommandGroup: () => null,
        getString: raw,
        getInteger: (name: string) => {
          const value = raw(name);
          if (value === null) return null;
          const parsed = Number.parseInt(value, 10);
          return Number.isNaN(parsed) ? null : parsed;
        },
        getNumber: (name: string) => {
          const value = raw(name);
          if (value === null) return null;
          const parsed = Number.parseFloat(value);
          return Number.isNaN(parsed) ? null : parsed;
        },
        getBoolean: (name: string) => {
          const value = raw(name)?.toLowerCase();
          return value === "true" || value === "yes" || value === "on" || value === "1";
        },
        getUser: (name: string) => resolveUser(raw(name)),
        getMember: (name: string) => resolveMember(raw(name)),
        getChannel: (name: string) => resolveChannel(raw(name)),
        getRole: (name: string) => resolveRole(raw(name)),
        getMentionable: (name: string) => {
          const value = raw(name);
          return resolveUser(value) ?? resolveMember(value) ?? resolveRole(value) ?? resolveChannel(value);
        },
        getAttachment: () => null,
        getFocused: () => {
          throw new Error("Not supported");
        },
      },
      reply: async (card: any) => {
        const cardToSend = { ...card, flags: (card.flags ?? 32768) & ~64 };
        replyMessage = await message.reply(cardToSend).catch(() => undefined);
        replied = true;
        return replyMessage;
      },
      deferReply: async () => {
        deferred = true;
      },
      editReply: async (card: any) => {
        if (replyMessage) {
          await replyMessage.edit(card).catch(() => undefined);
          return;
        }
        const cardToSend = { ...card, flags: (card.flags ?? 32768) & ~64 };
        replyMessage = await message.reply(cardToSend).catch(() => undefined);
        replied = true;
      },
      followUp: async (card: any) => {
        return await message.reply(card).catch(() => undefined);
      },
    };
  }

  client.on("interactionCreate", async (interaction) => {
    try {
      if (interaction.isAutocomplete()) {
        const command = registry.get(interaction.commandName);
        if (
          command?.autocomplete &&
          (!command.module ||
            !interaction.guildId ||
            moduleLoader.isActive(interaction.guildId, command.module))
        ) {
          await command.autocomplete(interaction, services);
        } else {
          await interaction.respond([]).catch(() => undefined);
        }
        return;
      }

      if (interaction.isChatInputCommand()) {
        const command = registry.get(interaction.commandName);
        if (!command) {
          await interaction.reply(ui.ephemeralCard(ui.makeErrorCard("Unknown Command", "That command is not registered."))).catch(() => undefined);
          return;
        }

        if (command.module && interaction.guildId) {
          const enabled = moduleLoader.isActive(interaction.guildId, command.module);
          if (!enabled) {
            await interaction
              .reply(
                ui.ephemeralCard(
                  ui.makeErrorCard(
                    "Module Disabled",
                    `The **${command.module}** module is disabled on this server. Open \`/lumi\` to enable it.`,
                  ),
                ),
              )
              .catch(() => undefined);
            return;
          }
        }

        if (command.requiresAdmin) {
          if (!interaction.guildId) {
            await interaction
              .reply(
                ui.ephemeralCard(
                  ui.makeErrorCard(
                    "Server Only",
                    "That command can only be used in a server.",
                  ),
                ),
              )
              .catch(() => undefined);
            return;
          }
          const allowed = await hasAdminAccess({
            guildId: interaction.guildId,
            userId: interaction.user.id,
            roleIds: roleIdsFrom(interaction.member, interaction.guildId),
            guildOwnerId: interaction.guild?.ownerId,
            memberPermissions: interaction.memberPermissions,
            client,
            permits: services.permits,
          });
          if (!allowed) {
            await interaction
              .reply(
                ui.ephemeralCard(
                  ui.makeErrorCard(
                    "Missing Permissions",
                    "You need **Manage Server** or an admin permit to use that command.",
                  ),
                ),
              )
              .catch(() => undefined);
            return;
          }
        }

        try {
          await command.execute(interaction, services);
          commandsExecuted.inc({
            command: interaction.commandName,
            module: command.module ?? "builtin",
            status: "ok",
          });
        } catch (err) {
          logger.error(`Command /${interaction.commandName} failed:`, err);
          commandsExecuted.inc({
            command: interaction.commandName,
            module: command.module ?? "builtin",
            status: "error",
          });
          const card = commandErrorCard(err);
          if (interaction.deferred || interaction.replied) {
            await interaction.followUp(card).catch(() => undefined);
          } else {
            await interaction.reply(card).catch(() => undefined);
          }
        }
        return;
      }

      if (interaction.isButton()) {
        if (await handlePingButton(interaction, services)) return;
      }

      if (
        interaction.isButton() ||
        interaction.isAnySelectMenu() ||
        interaction.isModalSubmit()
      ) {
        if (await handleHubInteraction(interaction, services)) return;
      }

      if (interaction.isButton() || interaction.isAnySelectMenu() || interaction.isModalSubmit()) {
        if (!interaction.customId.startsWith("permit_")) return;
        const guildId = interaction.guildId;
        if (!guildId) return;
        const allowed = await hasAdminAccess({
          guildId,
          userId: interaction.user.id,
          roleIds: roleIdsFrom(interaction.member, guildId),
          guildOwnerId: interaction.guild?.ownerId,
          memberPermissions: interaction.memberPermissions,
          client,
          permits: services.permits,
        });
        if (!allowed) {
          await interaction
            .reply(
              ui.ephemeralCard(
                ui.makeErrorCard(
                  "Missing Permissions",
                  "You need **Manage Server** or an admin permit to manage permits.",
                ),
              ),
            )
            .catch(() => undefined);
          return;
        }
        const panel = getPanel(guildId, interaction);

        if (interaction.isModalSubmit()) {
          await panel.handleModalSubmit(interaction);
        } else if (interaction.isButton()) {
          await panel.handleInteraction(interaction);
        } else {
          await panel.handleSelectMenu(interaction);
        }
      }
    } catch (err) {
      logger.error("Unhandled interaction error:", err);
    }
  });

  const token = process.env.BOT_TOKEN;
  if (!token) {
    logger.error("BOT_TOKEN is not set");
    process.exit(1);
  }

  await boot({ token, client });

  let shuttingDown = false;
  const shutdownAll = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}, shutting down...`);

    for (const module of moduleLoader.listAll()) {
      try {
        await module.definition.onUnload(services);
      } catch (err) {
        logger.error(`Error unloading module ${module.manifest.name}:`, err);
      }
    }

    try {
      metricsServer?.stop();
      await rpc.stop();
      await shutdown(client);
      await invalidation.close();
      await disconnectDatabase();
      await redis.quit();
    } catch (err) {
      logger.error("Error during shutdown:", err);
    }

    process.exit(0);
  };

  process.on("SIGINT", () => void shutdownAll("SIGINT"));
  process.on("SIGTERM", () => void shutdownAll("SIGTERM"));

  console.log("Lumi v2 is ready!");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
