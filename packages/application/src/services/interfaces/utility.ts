import type { ChatInputCommandInteraction, User } from "discord.js";

export interface IMediaUtilityService {
  handleMediaRequest(
    interaction: ChatInputCommandInteraction,
    targetUser: User,
    type: "avatar" | "banner" | "server-icon",
  ): Promise<void>;
}
