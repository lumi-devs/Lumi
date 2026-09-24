import { buildRestOptions } from "#lib/discord-rest.js";
import { parseRedisConnectionOption } from "#lib/database/redis.js";
import { envParseInteger, envParseString, getBotToken } from "#lib/env.js";
import { PinoSapphireLogger } from "#lib/logging/PinoSapphireLogger.js";
import type { OwnedEventBus } from "#lib/event-bus/factory.js";
import { SapphireClient } from "@sapphire/framework";
import { Routes, type APIUser } from "discord-api-types/v10";
import { installContainerServices } from "./container-services.js";

export interface ApiContainerServices {
  client: SapphireClient;
  ownedEventBus: OwnedEventBus;
}

/**
 * The `installContainerServices()` counterpart for a process that serves RPC
 * traffic only and never opens a Discord gateway connection.
 *
 * @remarks
 *
 * RPC handlers (`modules/*\/rpc.ts`, audited directly rather than assumed)
 * only ever reach `container.client.rest` and `container.client.user.id` —
 * never gateway-cached state (`.guilds.cache`, `.channels.cache`, ...); that
 * residual gap is `implement.ts`'s `cachedGuild()`, called out in the API
 * extraction checkpoint as still requiring a real gateway connection and not
 * yet reachable from this process. So this builds a `SapphireClient` and
 * authenticates its REST manager, but deliberately never calls `login()` —
 * that method both loads every Sapphire piece *and* opens the websocket in
 * one call (`node_modules/@sapphire/framework` `SapphireClient#login`), and
 * a gateway connection is exactly what this process must not hold. The
 * piece-loading half is safe to run alone (nothing here ever executes a
 * gateway-triggered listener, since no gateway event will ever fire), so
 * it's replicated by hand below; only the trailing `super.login(token)` call
 * is skipped.
 *
 * A side effect of constructing a plain `SapphireClient` instead of
 * `LumiClient`: none of `LumiClient`'s own plugin registrations
 * (`@lumi/core/setup`'s scheduled-tasks import in particular) are active
 * unless this process imports them itself, which it does not. That's load-
 * bearing, not incidental — `@sapphire/plugin-scheduled-tasks` constructs a
 * live BullMQ `Queue` and `Worker` the moment a client carrying its `tasks`
 * option is constructed (`ScheduledTaskHandler`'s constructor, unconditional,
 * independent of `login()`), and this process must never run that worker
 * alongside the primary shard's.
 */
export async function installApiContainerServices(): Promise<ApiContainerServices> {
  const client = new SapphireClient({
    intents: [],
    rest: buildRestOptions(),
    baseUserDirectory: null,
    loadDefaultErrorListeners: false,
    loadApplicationCommandRegistriesStatusListeners: false,
    loadMessageCommandListeners: false,
    logger: {
      instance: new PinoSapphireLogger(envParseString("SERVICE_NAME", "lumi-api")),
    },
    // Required by `ClientOptions`'s type (a global augmentation from
    // `@sapphire/plugin-scheduled-tasks`, present whether or not that
    // package's `register` module was ever imported) but functionally
    // inert here: `ScheduledTaskHandler` - the thing that actually reads
    // this and opens a BullMQ `Queue`/`Worker` - is only constructed by
    // that plugin's `preGenericsInitialization` hook, which `setup-api.ts`
    // deliberately never registers. See that file's comment.
    tasks: {
      bull: {
        connection: {
          ...parseRedisConnectionOption(),
          db: envParseInteger("REDIS_TASK_DB", 1),
        },
      },
    },
  });

  const ownedEventBus = installContainerServices(client);

  client.rest.setToken(getBotToken());
  const me = (await client.rest.get(Routes.user())) as APIUser;
  // `ClientUser`'s constructor is `protected` in discord.js's own typings -
  // it's meant to be built only from a gateway READY payload. Every RPC call
  // site that reads `container.client.user` today reads only `.id`
  // (confirmed by grep across `modules/*/rpc.ts` and `lib/rpc/*.ts`), so a
  // real `ClientUser` isn't worth fighting the protected constructor for;
  // this stand-in is deliberately minimal and documented rather than cast
  // through the protected boundary. Extend it if a handler ever needs more.
  client.user = { id: me.id } as NonNullable<typeof client.user>;

  await Promise.all([...client.stores.values()].map((store) => store.loadAll()));

  return { client, ownedEventBus };
}
