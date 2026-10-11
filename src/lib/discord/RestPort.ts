import type { APIGuild, APIGuildMember } from "discord-api-types/v10";

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

export interface DiscordRestPort {
  fetchGuild(guildId: string): Promise<APIGuild | null>;
  fetchMember(guildId: string, userId: string): Promise<APIGuildMember | null>;

  removeBan(guildId: string, userId: string, reason: string): Promise<void>;

  clearTimeout(guildId: string, userId: string, reason: string): Promise<void>;

  clearVoiceMute(guildId: string, userId: string, reason: string): Promise<void>;
}
