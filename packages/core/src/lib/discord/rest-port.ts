import type { APIGuild, APIGuildMember } from "discord-api-types/v10";

/**
 * Thrown by a `DiscordRestPort` method for any REST failure that isn't the
 * confirmed-absent/already-undone case that method swallows into `null` or a
 * no-op. Carries the Discord JSON error `code` (and HTTP `status`, when
 * known) structurally, the same shape callers already read off a raw
 * `DiscordAPIError`/`HTTPError` via `errorCode()`.
 */
export class DiscordRestApiError extends Error {
  public readonly code: number | string | undefined;
  public readonly status: number | undefined;

  public constructor(
    message: string,
    code: number | string | undefined,
    status: number | undefined,
  ) {
    super(message);
    this.name = "DiscordRestApiError";
    this.code = code;
    this.status = status;
  }
}

/**
 * The Discord REST calls that gateway-free business logic (RPC guild/member
 * authorization lookups, moderation-case undo) needs, seamed off from
 * `container.client.rest` so those callers can be tested against an
 * in-memory fake instead of mocking REST client internals.
 *
 * Every method owns its own error-code mapping: a confirmed-absent resource
 * (404, or the curated "Unknown Guild"/"Unknown Member" JSON codes) resolves
 * to `null`; an already-undone Discord-side effect ("Unknown Ban"/"Unknown
 * Member" on the undo routes) resolves as a no-op; everything else rejects
 * with a `DiscordRestApiError` carrying the original code/status/message.
 */
export interface DiscordRestPort {
  fetchGuild(guildId: string): Promise<APIGuild | null>;
  fetchMember(guildId: string, userId: string): Promise<APIGuildMember | null>;

  /** Removes a ban. A no-op (not an error) if the target isn't banned. */
  removeBan(guildId: string, userId: string, reason: string): Promise<void>;

  /** Clears a timeout. A no-op (not an error) if the member is already gone. */
  clearTimeout(guildId: string, userId: string, reason: string): Promise<void>;

  /** Clears a voice server-mute. A no-op (not an error) if the member is already gone. */
  clearVoiceMute(guildId: string, userId: string, reason: string): Promise<void>;
}
