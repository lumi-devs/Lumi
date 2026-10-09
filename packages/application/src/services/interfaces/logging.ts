export interface LogClaim {
  channelId: string;
  authorId: string;
  messageId: string;
  claimedAt: string;
  replyChannelId?: string;
  replyMessageId?: string;
}

export interface ILoggingService {
  issueLogClaimCode(guildId: string, issuerId: string): Promise<string>;
  claimLogCode(guildId: string, code: string, messageId: string, authorId: string, replyChannelId?: string, replyMessageId?: string): Promise<LogClaim | null>;
  resolveLogChannel(guildId: string, toggleKey: string): Promise<string | null>;
  sendLog(guildId: string, toggleKey: string, color: number, title: string, lines: string[]): Promise<void>;
}
