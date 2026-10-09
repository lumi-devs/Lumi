import { container } from "#lib/services.js";
import { RESTJSONErrorCodes } from "discord.js";
import { Routes, type APIGuild, type APIGuildMember } from "discord-api-types/v10";
import { DiscordRestApiError, type DiscordRestPort } from "./rest-port.js";

/**
 * True only for a Discord response that confirms the resource genuinely
 * doesn't exist (a 404, or the curated "Unknown Guild"/"Unknown Member" JSON
 * error codes) - never for a 5xx, a network failure, or a rate limit, which
 * must propagate instead of being silently treated as "not found". Checked
 * structurally (`.code`/`.status`, the shape both `DiscordAPIError` and
 * `HTTPError` from `@discordjs/rest` carry) rather than with `instanceof`,
 * since `discord.js` re-exports those classes from its own module scope and
 * a REST client swapped in for tests won't reject with that same identity.
 */
function isConfirmedAbsent(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const { code, status } = err as { code?: unknown; status?: unknown };
  if (status === 404) return true;
  return (
    code === RESTJSONErrorCodes.UnknownGuild ||
    code === RESTJSONErrorCodes.UnknownMember
  );
}

function isCode(err: unknown, ...codes: (number | string)[]): boolean {
  if (!err || typeof err !== "object") return false;
  const { code } = err as { code?: unknown };
  return codes.includes(code as number | string);
}

function toApiError(err: unknown): DiscordRestApiError {
  if (err instanceof Error) {
    const { code, status } = err as Error & {
      code?: number | string;
      status?: number;
    };
    return new DiscordRestApiError(err.message, code, status);
  }
  return new DiscordRestApiError(String(err), undefined, undefined);
}

/**
 * Real `DiscordRestPort` implementation, backed by `container.client.rest` -
 * the same REST manager every gateway-free process (`apps/api`,
 * `apps/scheduler`) already authenticates without opening a gateway
 * connection. Registered on the container alongside `container.db` et al.
 * (`installContainerServices`) so a test can swap in a fake instead.
 */
export class DiscordRestAdapter implements DiscordRestPort {
  public async fetchGuild(guildId: string): Promise<APIGuild | null> {
    try {
      return (await container.client.rest.get(Routes.guild(guildId), {
        query: new URLSearchParams({ with_counts: "true" }),
      })) as APIGuild;
    } catch (err) {
      if (isConfirmedAbsent(err)) return null;
      throw toApiError(err);
    }
  }

  public async fetchMember(
    guildId: string,
    userId: string,
  ): Promise<APIGuildMember | null> {
    try {
      return (await container.client.rest.get(
        Routes.guildMember(guildId, userId),
      )) as APIGuildMember;
    } catch (err) {
      if (isConfirmedAbsent(err)) return null;
      throw toApiError(err);
    }
  }

  public async removeBan(
    guildId: string,
    userId: string,
    reason: string,
  ): Promise<void> {
    try {
      await container.client.rest.delete(Routes.guildBan(guildId, userId), {
        reason,
      });
    } catch (err) {
      if (isCode(err, RESTJSONErrorCodes.UnknownBan)) return;
      throw toApiError(err);
    }
  }

  public async clearTimeout(
    guildId: string,
    userId: string,
    reason: string,
  ): Promise<void> {
    try {
      await container.client.rest.patch(Routes.guildMember(guildId, userId), {
        body: { communication_disabled_until: null },
        reason,
      });
    } catch (err) {
      if (isCode(err, RESTJSONErrorCodes.UnknownMember)) return;
      throw toApiError(err);
    }
  }

  public async clearVoiceMute(
    guildId: string,
    userId: string,
    reason: string,
  ): Promise<void> {
    try {
      await container.client.rest.patch(Routes.guildMember(guildId, userId), {
        body: { mute: false },
        reason,
      });
    } catch (err) {
      if (isCode(err, RESTJSONErrorCodes.UnknownMember)) return;
      throw toApiError(err);
    }
  }
}
