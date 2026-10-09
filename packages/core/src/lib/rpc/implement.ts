import { container } from "#lib/services.js";
import { z } from "zod";
import {
  CodedRpcError,
  RpcFailureCodes,
  type RpcAuth,
  type RpcInputOf,
  type RpcOutputOf,
  type RpcRequest,
  type RpcSliceEntry,
} from "@lumi/contracts/rpc";
import { snowflakeString } from "#lib/module-system/config-schema.js";
import { authorize } from "#lib/permissions/authorize.js";
import { checkGuildManagerRest } from "#lib/rpc/discord-rest-lookup.js";

interface RpcAuthContexts {
  guildManager: { guildId: string; actorId: string };
  botOwner: { actorId: string };
  session: { actorId: string; guildId: string | undefined };
  public: { actorId: string | undefined; guildId: string | undefined };
}

type RpcHandlerContext<E extends RpcSliceEntry> = RpcAuthContexts[E["auth"]] & {
  input: RpcInputOf<E>;
};

type RpcHandler<E extends RpcSliceEntry> = (
  context: RpcHandlerContext<E>,
) => Promise<RpcOutputOf<E>> | RpcOutputOf<E>;

type RpcSliceOf<S> = { [A in keyof S]: RpcSliceEntry };

export type RpcHandlers<S extends RpcSliceOf<S>> = {
  [A in keyof S]: RpcHandler<S[A]>;
};

export type RpcBoundHandler = (req: RpcRequest) => Promise<unknown>;

export type RpcImplementation = ReadonlyMap<string, RpcBoundHandler>;

function forbidden(message: string): CodedRpcError {
  return new CodedRpcError(RpcFailureCodes.Forbidden, message);
}

const GuildIdSchema = snowflakeString();

export function requireGuildId(guildId: string | null | undefined): string {
  if (guildId && GuildIdSchema.safeParse(guildId).success) return guildId;
  throw new CodedRpcError(
    RpcFailureCodes.BadRequest,
    "guildId is required and must be a valid snowflake",
  );
}

// Re-checked live against the guild rather than trusted from the dashboard
// session, whose cached guild list can be up to `SESSION_TTL_MS` stale.
//
// This goes over REST (`checkGuildManagerRest`), not a gateway cache: the
// gateway only caches guilds the current shard actually owns, so a
// guild-existence/ManageGuild check sourced from it would silently fail for
// any guild on another shard (or on a gateway-less `apps/api` process).
export async function requireGuildManager(
  guildId: string,
  actorId: string | undefined,
): Promise<string> {
  if (!actorId) throw forbidden("actorId is required");
  let check: Awaited<ReturnType<typeof checkGuildManagerRest>>;
  try {
    check = await checkGuildManagerRest(guildId, actorId);
  } catch (err) {
    container.logger.warn(`[RPC] guild manager check failed for ${guildId}`, err);
    throw new CodedRpcError(
      RpcFailureCodes.HandlerError,
      "Could not verify your permissions with Discord right now. Try again shortly.",
      { retryable: true },
    );
  }
  if (!check) {
    throw new CodedRpcError(
      RpcFailureCodes.GuildNotFound,
      "Guild not found in bot cache",
    );
  }
  if (!check.isManager) {
    throw forbidden("Missing ManageGuild permission");
  }
  return actorId;
}

type RpcAuthorizers = {
  [A in keyof RpcAuthContexts]: (req: RpcRequest) => Promise<RpcAuthContexts[A]>;
};

// `req.actorId` is an unsigned claim; it identifies the caller only because
// the transport already authenticated them with RPC_INTERNAL_TOKEN.
const authorizers: RpcAuthorizers = {
  guildManager: async (req) => {
    const guildId = requireGuildId(req.guildId);
    const actorId = await requireGuildManager(guildId, req.actorId);
    return { guildId, actorId };
  },
  botOwner: async (req) => {
    if (!req.actorId || !(await authorize({ userId: req.actorId }, { kind: "botOwner" }))) {
      throw forbidden("Bot Owner authorization required for this action.");
    }
    return { actorId: req.actorId };
  },
  session: (req) => {
    if (!req.actorId) throw forbidden("actorId is required");
    return Promise.resolve({ actorId: req.actorId, guildId: req.guildId });
  },
  public: (req) =>
    Promise.resolve({ actorId: req.actorId, guildId: req.guildId }),
};

const NoInput = z.unknown().transform((): undefined => undefined);

interface InputValidator {
  parse(data: unknown): unknown;
}

function parseInput<T>(validator: InputValidator, data: unknown): T {
  try {
    return validator.parse(data) as T;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new CodedRpcError(RpcFailureCodes.BadRequest, `Bad payload: ${msg}`);
  }
}

function requireModuleLoaded(name: string): void {
  if (!container.moduleStore.get(name)) {
    throw new CodedRpcError(
      RpcFailureCodes.ModuleNotLoaded,
      `The ${name} module is not loaded`,
    );
  }
}

function withInput<T extends object, I>(auth: T, input: I): T & { input: I } {
  return { ...auth, input };
}

// Generic over the auth level itself (not an entry type) so indexing
// `authorizers` by it keeps the context type tied to that level.
function bindAction<A extends RpcAuth, I, O>(
  entry: {
    auth: A;
    input?: InputValidator;
    requiresEnabled?: string;
  },
  handler: (context: RpcAuthContexts[A] & { input: I }) => Promise<O> | O,
): RpcBoundHandler {
  return async (req) => {
    const auth = await authorizers[entry.auth](req);
    // Filter-only actions are called with no data at all.
    const input = parseInput<I>(entry.input ?? NoInput, req.data ?? {});
    if (entry.requiresEnabled !== undefined) {
      requireModuleLoaded(entry.requiresEnabled);
    }
    return handler(withInput(auth, input));
  };
}

/** Binds a contract slice to its handlers, applying auth, input parsing and the required-module check once per action. */
export function implementRpc<S extends RpcSliceOf<S>>(
  slice: S,
  handlers: RpcHandlers<S>,
): RpcImplementation {
  const bound = new Map<string, RpcBoundHandler>();
  for (const action in slice) {
    bound.set(
      action,
      bindAction<
        S[typeof action]["auth"],
        RpcInputOf<S[typeof action]>,
        RpcOutputOf<S[typeof action]>
      >(slice[action], handlers[action]),
    );
  }
  return bound;
}
