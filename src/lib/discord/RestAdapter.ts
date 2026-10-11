import { container } from "#src/lib/Services.js";
import { RESTJSONErrorCodes } from "discord.js";
import { Routes, type APIGuild, type APIGuildMember } from "discord-api-types/v10";
import { DiscordRestApiError, type DiscordRestPort } from "#src/lib/discord/RestPort.js";

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

export class DiscordRestAdapter implements DiscordRestPort {
  private async patchMember(
    guildId: string,
    userId: string,
    reason: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    try {
      await container.client.rest.patch(Routes.guildMember(guildId, userId), {
        body,
        reason,
      });
    } catch (err) {
      if (isCode(err, RESTJSONErrorCodes.UnknownMember)) return;
      throw toApiError(err);
    }
  }

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
    await this.patchMember(guildId, userId, reason, {
      communication_disabled_until: null,
    });
  }

  public async clearVoiceMute(
    guildId: string,
    userId: string,
    reason: string,
  ): Promise<void> {
    await this.patchMember(guildId, userId, reason, { mute: false });
  }
}
